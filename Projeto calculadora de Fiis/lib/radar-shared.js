/**
 * lib/radar-shared.js
 * Radar de Oportunidades (Carros de Leilão): busca os carros de leilão JUDICIAL no BuscaAii,
 * consulta a FIPE, lê a página/edital dos melhores e grava o resultado no Postgres.
 *
 * Tudo fica na tabela chave-valor "RadarLeilao" (criada sozinha em garantirTabelaRadar):
 *   "resultado" -> última análise  |  "config" -> parâmetros  |  "fipe:<caminho>" -> cache da API FIPE
 *
 * Login do BuscaAii vem do .env (BUSCAAII_EMAIL / BUSCAAII_SENHA). FIPE_TOKEN é opcional.
 */

const prisma = require('./prisma');
const A = require('./radar-analise');

const SITE = 'https://www.buscaaii.com.br';
const SUPABASE_URL = 'https://wiwmqzocaribjhclptpu.supabase.co';
const FIPE_API = 'https://fipe.parallelum.com.br/api/v2';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128 Safari/537.36';
const dormir = (ms) => new Promise(r => setTimeout(r, ms));

// ---------------------------------------------------------------- armazenamento

/** Cria a tabela do Radar se não existir (idempotente, mesmo padrão de lib/bootstrap.js). */
async function garantirTabelaRadar() {
    try {
        await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "RadarLeilao" (
            "chave" TEXT PRIMARY KEY,
            "valor" JSONB,
            "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`);
        console.log('[Prisma] Tabela RadarLeilao verificada/criada com sucesso.');
    } catch (e) {
        console.error('[Prisma] Falha ao garantir tabela RadarLeilao:', e.message);
    }
}

/** Valor salvo da chave; `undefined` quando a chave não existe (null é um valor válido no cache FIPE). */
async function lerChave(chave) {
    const linhas = await prisma.$queryRaw`SELECT "valor" FROM "RadarLeilao" WHERE "chave" = ${chave}`;
    return linhas.length ? linhas[0].valor : undefined;
}

async function gravarChave(chave, valor) {
    const json = JSON.stringify(valor ?? null);
    await prisma.$executeRaw`INSERT INTO "RadarLeilao" ("chave", "valor", "atualizadoEm")
        VALUES (${chave}, ${json}::jsonb, NOW())
        ON CONFLICT ("chave") DO UPDATE SET "valor" = EXCLUDED."valor", "atualizadoEm" = NOW()`;
}

async function carregarConfig() {
    const salvo = (await lerChave('config')) || {};
    return {
        ...A.CONFIG_PADRAO, ...salvo,
        reparoPorCondicao: { ...A.CONFIG_PADRAO.reparoPorCondicao, ...(salvo.reparoPorCondicao || {}) }
    };
}

// ---------------------------------------------------------------- estado da execução (memória)

const estado = { rodando: false, erro: null, inicio: null, fim: null, etapa: '', atual: 0, total: 0, log: [] };

function log(msg) {
    console.log(`[Radar] ${msg}`);
    estado.log.push(`${new Date().toLocaleTimeString('pt-BR')}  ${msg}`);
    estado.log.splice(0, Math.max(0, estado.log.length - 200));
}

function etapa(nome, total = 0) {
    Object.assign(estado, { etapa: nome, atual: 0, total });
    log(nome);
}

// ---------------------------------------------------------------- BuscaAii

function buscaaiiConfigurado() {
    return Boolean(process.env.BUSCAAII_EMAIL && process.env.BUSCAAII_SENHA);
}

async function buscarTexto(url, opcoes = {}) {
    const r = await fetch(url, { headers: { 'User-Agent': USER_AGENT, ...(opcoes.headers || {}) }, signal: AbortSignal.timeout(opcoes.timeout || 30000) });
    if (!r.ok) throw new Error(`HTTP ${r.status} em ${url}`);
    return r.text();
}

/** A chave pública (anon) do Supabase do BuscaAii fica no bundle JS do site. */
async function obterAnonKey() {
    const html = await buscarTexto(`${SITE}/leiloes`);
    const chunk = html.match(/\/_next\/static\/chunks\/pages\/_app-[a-f0-9]+\.js/);
    if (!chunk) throw new Error('Não encontrei o bundle do BuscaAii para ler a chave pública.');
    const js = await buscarTexto(SITE + chunk[0]);
    for (const jwt of js.match(/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[\w-]+\.[\w-]+/g) || []) {
        const dados = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString());
        if (dados.role === 'anon' && SUPABASE_URL.includes(dados.ref)) return jwt;
    }
    throw new Error('Chave pública do Supabase não encontrada no BuscaAii.');
}

async function loginBuscaaii(anon) {
    if (!buscaaiiConfigurado()) throw new Error('Login do BuscaAii não configurado: defina BUSCAAII_EMAIL e BUSCAAII_SENHA no .env.');
    const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { apikey: anon, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: process.env.BUSCAAII_EMAIL, password: process.env.BUSCAAII_SENHA }),
        signal: AbortSignal.timeout(30000)
    });
    if (!r.ok) throw new Error(r.status === 400 ? 'Falha no login do BuscaAii: confira BUSCAAII_EMAIL e BUSCAAII_SENHA.' : `Falha no login do BuscaAii (${r.status}).`);
    return (await r.json()).access_token;
}

const CAMPOS = 'id,marca_veiculo,modelo_veiculo,ano_veiculo,tipo_leilao,tipo_produto,lance_inicial,lance_atual,'
    + 'lance_inicial_segunto_lote,valor_referencia,data_encerramento,cidade,estado,leiloeiro,fonte,imagem,observacao';

async function baixarLotes(anon, token, tipos) {
    const hoje = new Date().toISOString().slice(0, 10);
    const lotes = [];
    for (let offset = 0; ; offset += 500) {
        const url = `${SUPABASE_URL}/rest/v1/ficha_leilao_veiculos_filtrada?select=${CAMPOS}`
            + `&tipo_leilao=eq.JUDICIAL&deleted=eq.false&is_recuperacao=eq.false`
            + `&data_encerramento=gte.${hoje}&tipo_produto=in.(${tipos.join(',')})`
            + `&order=data_encerramento.asc,id.asc&offset=${offset}&limit=500`;
        const r = await fetch(url, { headers: { apikey: anon, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(60000) });
        if (!r.ok) throw new Error(`BuscaAii respondeu ${r.status} ao listar os lotes.`);
        const bloco = await r.json();
        lotes.push(...bloco);
        log(`${lotes.length} lotes baixados...`);
        if (bloco.length < 500) return lotes;
        await dormir(500);
    }
}

// ---------------------------------------------------------------- FIPE

// tokens genéricos que aparecem em quase todo nome FIPE e não ajudam a achar a versão
const TOKENS_FRACOS = new Set(['16v', '8v', '12v', '20v', '24v', 'flex', 'mi', 'mpfi', '2p', '3p', '4p', '5p', 'aut', 'aut.', 'mec', 'mec.',
    'total', 'gasolina', 'alcool', 'diesel', 'sedan', 'sed.', 'hatch', 'hatch.']);
// versões caras que só devem ser escolhidas quando o título do lote as cita
const TOKENS_PREMIUM = new Set(['gti', 'gts', 'cc', 'turbo', 'rs', 'amg', 'cabrio', 'cabriolet', 'conversivel', 'coupe', 'rallye',
    'v6', 'v8', 'srt', 'cupra', 'gsi', 'type', 'tsi', 'competition', 'nismo', 'sti', 'racing']);

/** Consulta a API FIPE (parallelum) com cache no Postgres e respeito ao limite diário (~1000/dia). */
class Fipe {
    constructor(cache) {
        this.cache = cache; // Map caminho -> resposta (null = 404)
        this.esgotado = false;
        this.chamadas = 0;
    }

    async get(caminho) {
        if (this.cache.has(caminho)) return this.cache.get(caminho);
        if (this.esgotado) return null;
        const headers = { 'User-Agent': USER_AGENT };
        if (process.env.FIPE_TOKEN) headers['X-Subscription-Token'] = process.env.FIPE_TOKEN;
        for (let tentativa = 0; tentativa < 3; tentativa++) {
            await dormir(350);
            let r;
            try {
                r = await fetch(FIPE_API + caminho, { headers, signal: AbortSignal.timeout(30000) });
            } catch {
                await dormir(2000);
                continue;
            }
            this.chamadas++;
            if (r.status === 429) {
                this.esgotado = true;
                log('Limite diário da API FIPE atingido. Os restantes ficam como "FIPE pendente".');
                return null;
            }
            if (r.status === 404 || r.ok) {
                const valor = r.ok ? await r.json() : null;
                this.cache.set(caminho, valor);
                await gravarChave(`fipe:${caminho}`, valor);
                return valor;
            }
            await dormir(2000);
        }
        return null;
    }

    async marca(marca) {
        const marcas = (await this.get('/cars/brands')) || [];
        const alvo = A.tokens(marca);
        if (!alvo.length) return null;
        const candidatas = marcas.filter(b => { const t = new Set(A.tokens(b.name)); return alvo.every(x => t.has(x)); });
        return candidatas.sort((x, y) => x.name.length - y.name.length)[0] || null;
    }

    /** Versões que existem na FIPE naquele ano (flex=5, gasolina=1, diesel=3). */
    async modelosNoAno(marcaCode, ano) {
        const res = new Map();
        for (const comb of ['5', '1', '3']) {
            const ms = await this.get(`/cars/brands/${marcaCode}/years/${ano}-${comb}/models`);
            if (ms === null && this.esgotado) return null;
            for (const m of ms || []) if (!res.has(m.code)) res.set(m.code, { nome: m.name, anoCode: `${ano}-${comb}` });
        }
        return res;
    }

    /** Retorna { preco, nome, status }. */
    async preco(marca, modelo, ano) {
        const b = await this.marca(marca);
        if (!b) return { preco: null, nome: null, status: this.esgotado ? 'FIPE pendente' : 'marca não encontrada na FIPE' };
        const ignorar = new Set([...A.tokens(marca), ...A.tokens(b.name), 'gm', 'vw', 'mb']);
        const q = A.tokens(modelo).filter(t => !ignorar.has(t));
        if (!q.length) return { preco: null, nome: null, status: 'modelo não identificado' };
        const familia = q[0];
        const peso = (t) => (TOKENS_FRACOS.has(t) ? 0.3 : 1);
        const total = q.reduce((s, t) => s + peso(t), 0);

        for (const a of [ano, ano + 1, ano - 1]) { // o "ano" do lote às vezes é o de fabricação
            const modelos = await this.modelosNoAno(b.code, a);
            if (modelos === null) return { preco: null, nome: null, status: 'FIPE pendente' };
            const pontuados = [];
            for (const [code, { nome, anoCode }] of modelos) {
                const f = new Set(A.tokens(nome));
                if (!f.has(familia)) continue;
                let score = q.filter(t => f.has(t)).reduce((s, t) => s + peso(t), 0) / total - 0.01 * f.size;
                score -= 0.3 * [...f].filter(t => TOKENS_PREMIUM.has(t) && !q.includes(t)).length;
                pontuados.push({ score, code, anoCode });
            }
            if (!pontuados.length) continue;
            pontuados.sort((x, y) => y.score - x.score);
            const melhor = pontuados[0].score;

            // várias versões empatadas (ex.: "Gol" sem motor/versão): usa a mediana de até 3 delas
            const precos = [], nomes = [];
            for (const p of pontuados.slice(0, 3)) {
                if (p.score < melhor - 0.08) break;
                const info = await this.get(`/cars/brands/${b.code}/models/${p.code}/years/${p.anoCode}`);
                if (info && info.price) {
                    precos.push(A.brlParaNumero(info.price));
                    nomes.push(`${info.model} ${a}`);
                } else if (this.esgotado) {
                    return { preco: null, nome: null, status: 'FIPE pendente' };
                }
            }
            if (precos.length) {
                const po = [...precos].sort((x, y) => x - y);
                const n = po.length;
                const mediana = n % 2 ? po[(n - 1) / 2] : (po[n / 2 - 1] + po[n / 2]) / 2;
                return { preco: mediana, nome: n === 1 ? nomes[0] : `mediana de ${n} versões: ${nomes.join(' | ')}`, status: 'ok' };
            }
        }
        return { preco: null, nome: null, status: `${familia} ${ano} não encontrado na FIPE` };
    }
}

async function carregarCacheFipe() {
    const linhas = await prisma.$queryRaw`SELECT "chave", "valor" FROM "RadarLeilao" WHERE "chave" LIKE 'fipe:%'`;
    return new Map(linhas.map(l => [l.chave.slice(5), l.valor]));
}

// ---------------------------------------------------------------- página do leiloeiro / edital PDF

/**
 * Recorta o trecho do texto que fala deste veículo (pela placa, renavam ou chassi).
 * Em edital PDF (estrito), vários lotes vêm colados: o trecho começa no nome do modelo
 * ("chev/spin ...") e termina no primeiro preço depois do identificador ("r$ 27.000,00"),
 * para não herdar "sucata"/"sem chave" do lote vizinho.
 */
function recortar(texto, lote, antes = 600, depois = 1200, estrito = true) {
    const obs = A.norm(`${lote.observacao || ''} ${lote.fonte || ''}`);
    const chaves = [
        ...(obs.match(/\b[a-z]{3}-?\d[a-z0-9]\d{2}\b/g) || []), // placas
        ...(obs.match(/\b\d{9,11}\b/g) || []),                  // renavam
        ...(obs.match(/\b[a-z0-9]{17}\b/g) || [])               // chassi
    ];
    const tn = A.norm(texto);
    const marca = new Set(A.tokens(lote.marca_veiculo));
    const familia = A.tokens(lote.modelo_veiculo).find(t => !marca.has(t) && t.length >= 3);
    const preco = /r\$\s*[\d.]+,\d{2}/g;
    for (const c of chaves) {
        for (const v of [c, c.replace('-', '')]) {
            const i = tn.indexOf(v);
            if (i < 0) continue;
            let ini = Math.max(0, i - antes);
            let fim = i + depois;
            if (estrito) {
                const pre = tn.slice(ini, i);
                let corte = 0;
                for (const m of pre.matchAll(preco)) corte = m.index + m[0].length; // fim do lote anterior
                const k = familia ? pre.lastIndexOf(familia) : -1;
                if (k >= corte) corte = pre.lastIndexOf(' ', k) + 1;               // início de "chev/spin"
                ini += corte;
                const depoisId = tn.slice(i, fim).match(/r\$\s*[\d.]+,\d{2}/);
                if (depoisId) fim = i + depoisId.index + depoisId[0].length;
            }
            return tn.slice(ini, fim);
        }
    }
    return null;
}

async function textoDoPdf(buffer) {
    // caminho interno: o index do pdf-parse 1.x tenta abrir um PDF de teste quando importado
    const pdfParse = require('pdf-parse/lib/pdf-parse.js');
    return (await pdfParse(buffer)).text || '';
}

/** Abre a página do lote no site do leiloeiro: usa o texto da página e procura o PDF do edital. */
async function lerEdital(lote) {
    if (!lote.fonte) return { trecho: null, status: 'sem link do leiloeiro' };
    let html;
    try {
        html = await buscarTexto(lote.fonte);
    } catch (e) {
        return { trecho: null, status: `site do leiloeiro inacessível (${e.name})` };
    }

    // texto visível da página do lote (muitos lotes vêm do BuscaAii sem descrição)
    const visivel = html.replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    let pagina = '';
    if (!String(lote.observacao || '').trim()) {
        pagina = recortar(visivel, lote, 300, 3000, false) || '';
        if (!pagina) {
            const i = visivel.search(/descri[cç][aã]o/i);
            pagina = i >= 0 ? visivel.slice(i, i + 3000) : '';
        }
    }

    const links = [...html.matchAll(/href=["']([^"']+)["']/gi)].map(m => m[1]);
    const pdfs = links.filter(l => /edital/i.test(l) || l.toLowerCase().split('?')[0].endsWith('.pdf'))
        .sort((x, y) => (/edital/i.test(x) ? 0 : 1) - (/edital/i.test(y) ? 0 : 1));
    if (!pdfs.length) {
        return { trecho: pagina || null, status: 'PDF não encontrado na página' + (pagina ? '; usei o texto da página' : ' (pode exigir JavaScript)') };
    }

    for (const link of pdfs.slice(0, 2)) {
        let texto;
        try {
            const url = new URL(link, lote.fonte).href;
            const r = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(60000) });
            const buffer = Buffer.from(await r.arrayBuffer());
            if (!r.ok || !buffer.subarray(0, 1024).includes('%PDF') || buffer.length > 20e6) continue;
            texto = await textoDoPdf(buffer);
        } catch (e) { // PDFs de leiloeiro costumam vir quebrados
            log(`edital ilegível em ${link}: ${e.name}`);
            continue;
        }
        const trecho = recortar(texto, lote);
        if (trecho) return { trecho: `${pagina} ${trecho}`, status: 'edital PDF lido' };
        // sem identificador: mantém só as cláusulas gerais (sub-rogação), sem valores de outros lotes
        const gerais = texto.split(/(?<=[.;])\s+/).filter(s => A.SUBROGACAO.test(A.norm(s)) && !/r\$\s*[\d.]+,\d{2}/.test(A.norm(s)));
        return { trecho: `${pagina} ${gerais.join(' ').slice(0, 4000)}`, status: 'edital PDF lido (só cláusulas gerais)' };
    }
    return { trecho: pagina || null, status: 'PDF do edital não pôde ser baixado/lido' };
}

// ---------------------------------------------------------------- execução completa

async function executar({ editais = 40 } = {}) {
    const cfg = await carregarConfig();

    etapa('Entrando no BuscaAii...');
    const anon = await obterAnonKey();
    const token = await loginBuscaaii(anon);
    etapa('Baixando carros de leilão judicial...');
    let lotes = await baixarLotes(anon, token, cfg.tiposProduto);

    const repetidas = A.imagensRepetidas(lotes); // antes dos filtros, para enxergar o lote todo
    lotes = lotes.filter(l => cfg.tiposProduto.includes(l.tipo_produto || 'CAR'));
    const fipe = new Fipe(await carregarCacheFipe());

    const processar = async (r, extra = '') => {
        const l = r.lote;
        const a = r.analise = A.analisarTexto(A.textoLote(l, extra));
        r.ano = a.anoModelo || l.ano_veiculo || null;
        r.foto = A.classificarFoto(l, repetidas);
        const descartado = a.bloqueios.length || (r.foto !== 'real' && cfg.descartarSemFoto) || (a.sinistro && cfg.descartarSinistro);
        if (descartado) Object.assign(r, { fipe: null, fipeModelo: null, fipeStatus: 'não consultado (descartado)' });
        else if (A.lanceBase(l).lance <= 0) r.fipeStatus = 'sem lance informado';
        else if (!l.marca_veiculo || !r.ano) r.fipeStatus = 'sem marca/ano';
        else if (!r.fipe) {
            const f = await fipe.preco(l.marca_veiculo, l.modelo_veiculo, Number(r.ano));
            Object.assign(r, { fipe: f.preco, fipeModelo: f.nome, fipeStatus: f.status });
        }
        A.avaliar(r, cfg);
    };

    etapa(`Analisando ${lotes.length} carros e consultando a FIPE...`, lotes.length);
    const resultados = [];
    for (const l of lotes) {
        l.observacao = String(l.observacao || '').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim().slice(0, 2500);
        const r = { lote: l, fipe: null, fipeModelo: null, fipeStatus: '' };
        await processar(r);
        resultados.push(r);
        estado.atual++;
        if (estado.atual % 100 === 0) log(`${estado.atual}/${lotes.length} analisados (${fipe.chamadas} consultas FIPE novas)`);
    }

    if (editais > 0) {
        // prioridade: melhores margens; depois lotes sem descrição/ano, que só a página do leiloeiro resolve
        const prioridade = (r) => (['VALE A PENA', 'TALVEZ'].includes(r.veredito) ? 0 : r.fipeStatus === 'sem marca/ano' ? 1 : 9);
        const candidatos = resultados.filter(r => prioridade(r) < 9)
            .sort((x, y) => (prioridade(x) - prioridade(y)) || ((y.calc.margem ?? 0) - (x.calc.margem ?? 0)))
            .slice(0, editais);
        etapa(`Lendo página/edital de ${candidatos.length} carros no site do leiloeiro...`, candidatos.length);
        for (const r of candidatos) {
            const { trecho, status } = await lerEdital(r.lote);
            r.editalStatus = status;
            if (trecho) {
                r.editalTrecho = trecho.replace(/\s+/g, ' ').slice(0, 4000);
                await processar(r, trecho);
            }
            estado.atual++;
            log(`${r.lote.modelo_veiculo}: ${status} -> ${r.veredito}`);
            await dormir(1000);
        }
    }

    A.ordenarResultados(resultados);
    await gravarChave('resultado', { geradoEm: new Date().toISOString(), resultados });

    const conta = (v) => resultados.filter(r => r.veredito === v).length;
    log(`Resumo: VALE A PENA ${conta('VALE A PENA')} | TALVEZ ${conta('TALVEZ')} | SEM FIPE ${conta('SEM FIPE')} | DESCARTAR ${conta('DESCARTAR')}`);
    const pendentes = resultados.filter(r => r.fipeStatus === 'FIPE pendente').length;
    if (pendentes) log(`${pendentes} carros ficaram sem FIPE pelo limite diário da API; a próxima atualização completa o que faltou.`);
}

/** Dispara a análise em segundo plano. Retorna false se já houver uma rodando. */
function iniciarAnalise(opcoes) {
    if (estado.rodando) return false;
    Object.assign(estado, { rodando: true, erro: null, inicio: new Date().toISOString(), fim: null, log: [] });
    executar(opcoes)
        .catch((e) => { estado.erro = e.message; log(`ERRO: ${e.message}`); })
        .finally(() => Object.assign(estado, { rodando: false, fim: new Date().toISOString(), etapa: estado.erro ? 'Erro' : 'Concluído', atual: 0, total: 0 }));
    return true;
}

/** Recalcula vereditos do último resultado com a configuração atual (sem rede). */
async function reavaliarResultado() {
    const dados = await lerChave('resultado');
    if (!dados) return;
    const cfg = await carregarConfig();
    dados.resultados.forEach(r => A.avaliar(r, cfg));
    A.ordenarResultados(dados.resultados);
    await gravarChave('resultado', dados);
}

module.exports = {
    estado, garantirTabelaRadar, lerChave, gravarChave, carregarConfig, buscaaiiConfigurado, Fipe, lerEdital, obterAnonKey,
    iniciarAnalise, reavaliarResultado
};
