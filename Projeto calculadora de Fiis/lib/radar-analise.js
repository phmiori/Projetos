/**
 * lib/radar-analise.js
 * Radar de Oportunidades (Carros de Leilão): regras puras de análise, sem rede nem banco.
 * Lê o texto do edital (estado, funcionamento, débitos, sinistro), classifica a foto do lote
 * e calcula custo, lucro e veredito de cada carro. Usado por lib/radar-shared.js.
 */

const CONFIG_PADRAO = {
    tiposProduto: ['CAR'],          // CAR, PICKUP_TRUCK, VAN, MOTORCYCLE, TRUCK
    comissaoLeiloeiro: 0.05,        // 5% sobre o lance
    custoDocumentacao: 1500,        // transferência, vistoria, despachante
    custoRemocao: 800,              // guincho / retirada do pátio ou do depositário
    desagioRevenda: 0.10,           // vende ~10% abaixo da FIPE para girar rápido
    margemMinima: 0.25,             // lucro / investimento mínimo para "VALE A PENA"
    // % da FIPE estimado para colocar o carro em ordem, por estado de conservação
    reparoPorCondicao: { bom: 0.05, regular: 0.12, desconhecido: 0.15, ruim: 0.25 },
    reparoExtraNaoFunciona: 0.15,
    descartarSemFoto: true,         // lote sem foto real costuma ser carro em péssimo estado
    descartarSinistro: true,        // qualquer menção a sinistro/colisão/monta no edital
    // lance abaixo disso (% da FIPE) costuma ser lance inicial simbólico: o preço final sobe muito
    lanceSuspeitoPctFipe: 0.35
};

// ---------------------------------------------------------------- utilidades

function norm(txt) {
    return String(txt ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '')
        .replace(/[^\x00-\x7f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function tokens(txt) {
    return norm(txt).replace(/[-/]/g, ' ').split(/[^a-z0-9.]+/).filter(Boolean);
}

function brlParaNumero(s) {
    return parseFloat(String(s).replace('R$', '').replace(/\./g, '').replace(',', '.').trim());
}

// ---------------------------------------------------------------- análise do edital

const BLOQUEIOS = [
    [/\bsucata\b/, 'Veículo declarado SUCATA'],
    [/(veiculo|automovel|bem|carro)( penhorado)?( \w+)? nao (foi |esta |se encontra )?(localizad|encontrad)|paradeiro (do (veiculo|bem) )?(e )?(desconhecid|ignorad)/, 'Veículo NÃO LOCALIZADO'],
    [/perda total/, 'Perda total'],
    [/incendi/, 'Veículo incendiado'],
    [/baixa (definitiva|do registro)/, 'Registro baixado'],
    [/(apenas|somente) (para )?(pecas|desmanche)/, 'Somente para peças'],
    [/(somente|so|apenas) (a )?lataria|carcaca/, 'Somente lataria/carcaça']
];

const ALERTAS = [
    [/nao funciona|nao (da|esta dando) partida|sem funcionamento|motor (nao|fundido|travado)|sem motor|problema (de|no) (motor|cambio)|vaza\w* (muito )?oleo/, 'Não funciona / problema mecânico'],
    [/sem (a )?chave|chave (nao|inexistente)/, 'Sem chave'],
    [/alienacao fiduciaria|credor fiduciario|alienado fiduciariamente/, 'Alienação fiduciária (verificar quitação)'],
    [/busca e apreensao/, 'Busca e apreensão'],
    [/roubo|furto/, 'Menção a roubo/furto'],
    [/batid|amassad/, 'Lataria batida/amassada (confira se não foi colisão)'],
    [/restricao (judicial|administrativa|renajud)|renajud|bloqueio/, 'Restrição / bloqueio registrado'],
    [/depositari/, 'Bem com depositário (retirada pode exigir diligência)'],
    [/agravo|recurso pendente|embargos/, 'Recurso/embargos pendentes no processo'],
    [/sem documento|documentacao (irregular|pendente)|sem crlv/, 'Documentação irregular'],
    [/remarcad|adulterad/, 'Chassi/motor remarcado']
];

const COND_RUIM = /pessimo|mau estado|mal estado|ruim|avaria|enferruj|podre|oxidad|amassad|quebrad|danificad|deteriorad|precari|problema (de|no) (motor|cambio)|vaza\w* (muito )?oleo/;
const COND_REGULAR = /regular|medio estado|razoave|estado medio|uso normal/;
const COND_BOM = /(bom|otimo|excelente) estado|(boa|otima) conservacao|bom de conservacao|bem conservad/;
const FUNCIONA_SIM = /funcionando|em funcionamento|funciona|da partida/;
const FUNCIONA_NAO = /nao funciona|nao (da|esta dando) partida|sem funcionamento|motor (nao|fundido|travado)|sem motor|inoperante/;

const SUBROGACAO = /sub-?roga|art(igo|\.)? ?130|livres? (e desembaracad\w+ )?de (quaisquer )?onus|livre e desembaracad|nao respondera|nao sera responsavel pel\w+ debit|debitos? .{0,60}(serao|sera) (quitad|pag)\w* com o (produto|valor)/;
const PALAVRAS_DEBITO = /ipva|multa|licenciamento|divida|debito|dpvat|taxa|tributo|financiamento|saldo devedor|despesa/;
const COBRANCA_ARREMATANTE = /arrematante (devera|deve|tera que) (pagar|arcar|recolher)/;
const NAO_DEBITO = /avaliad|avaliacao|lance|minimo|arremat|incremento|valor de|venda|praca|leilao/;
const DINHEIRO = /r\$\s*([\d.]+,\d{2})/g;

const SINISTRO = /sinistr|colisao|colidid|acidentad|abalroad|capotad|(pequena|media|grande) monta|perda parcial|indenizad\w* (pela|por) segurad|recuperad[oa] de (roubo|furto|sinistro)|enchente|alagad|submers/g;
const NEGA_SINISTRO = /(sem|nao (consta|ha|houve|possui|apresenta|tem)|nada consta|inexist|ausencia de|livre de)[^.;]{0,25}$/;

/** Trecho que indica sinistro/colisão no texto normalizado ('' se não houver). Ignora "não consta sinistro". */
function acharSinistro(t) {
    for (const m of t.matchAll(SINISTRO)) {
        if (!NEGA_SINISTRO.test(t.slice(Math.max(0, m.index - 40), m.index))) {
            return t.slice(Math.max(0, m.index - 80), m.index + m[0].length + 80).trim();
        }
    }
    return '';
}

function analisarTexto(texto) {
    const t = norm(texto);
    const out = {
        bloqueios: [], alertas: [], condicao: 'desconhecido', funciona: '?',
        debitos: 0, taxas: 0, subrogacao: false, sinistro: '', avaliacao: null, anoModelo: null
    };

    for (const [re, desc] of BLOQUEIOS) if (re.test(t)) out.bloqueios.push(desc);
    for (const [re, desc] of ALERTAS) if (re.test(t)) out.alertas.push(desc);

    if (FUNCIONA_NAO.test(t)) out.funciona = 'NÃO';
    else if (FUNCIONA_SIM.test(t)) out.funciona = 'sim';

    if (COND_RUIM.test(t) || out.funciona === 'NÃO') out.condicao = 'ruim';
    else if (COND_REGULAR.test(t)) out.condicao = 'regular';
    else if (COND_BOM.test(t)) out.condicao = 'bom';

    out.subrogacao = SUBROGACAO.test(t);
    out.sinistro = acharSinistro(t);

    for (const m of t.matchAll(DINHEIRO)) {
        const antes = t.slice(Math.max(0, m.index - 90), m.index);
        const valor = brlParaNumero(m[1]);
        if (/avaliad\w*\s*(em|por)?\s*(r\$)?\s*$/.test(antes.slice(-40)) && out.avaliacao === null) {
            out.avaliacao = valor;
        } else if (COBRANCA_ARREMATANTE.test(antes.slice(-70))) {
            out.taxas += valor; // despesas cobradas do arrematante: não se sub-rogam
        } else if (PALAVRAS_DEBITO.test(antes) && !NAO_DEBITO.test(antes.slice(-45))) {
            out.debitos += valor;
        }
    }

    let m = t.match(/ano\s*(?:\/|de fabricacao\s*\/?\s*)?\s*modelo\s*:?\s*(\d{4})\s*\/\s*(\d{4})/)
        || t.match(/\b((?:19|20)\d{2})\s*\/\s*((?:19|20)\d{2})\b/);
    if (!m) { // anos colados, comuns em URL: ...anomodelo20102011
        m = t.match(/(?<!\d)((?:19|20)\d{2})((?:19|20)\d{2})(?!\d)/);
        if (m && !(Number(m[2]) - Number(m[1]) >= 0 && Number(m[2]) - Number(m[1]) <= 1)) m = null;
    }
    if (m) {
        const ano = Number(m[2]);
        if (ano > 1950 && ano <= new Date().getFullYear() + 1) out.anoModelo = ano;
    }
    return out;
}

/** Junta título, descrição do edital e o "slug" da URL (que às vezes diz 'somente-lataria', o ano etc.). */
function textoLote(l, extra = '') {
    let slug = '';
    try { slug = new URL(l.fonte).pathname.replace(/[-_/]+/g, ' '); } catch { /* sem link */ }
    return `${l.modelo_veiculo || ''}. ${l.observacao || ''}. ${slug}. ${extra}`;
}

// ---------------------------------------------------------------- foto

// imagens "sem foto" que os sites de leiloeiro usam no lugar da foto real
const FOTO_GENERICA = /nao[-_]?disponivel|nopic|no[-_]?image|noimage|sem[-_]?foto|sem[-_]?imagem|imagem[-_]?indisponivel|placehold|ilustrativ|fallback|\/tribunais\/|\/logo/;
const MOTIVO_SINISTRO = 'Sinistro/colisão citado no edital';
const MOTIVO_FOTO = { 'sem foto': 'Sem foto do veículo', ilustrativa: 'Só foto ilustrativa/genérica' };

/**
 * A mesma imagem usada em carros diferentes é foto genérica, não do veículo. Compara marca +
 * modelo base ("Fiat Uno" == "Fiat Uno Mille Fire"), porque o mesmo carro aparece em vários
 * lotes (1ª/2ª praça) com o nome escrito de jeitos diferentes.
 */
function imagensRepetidas(lotes) {
    const familias = new Map();
    for (const l of lotes) {
        if (!l.imagem) continue;
        const marca = new Set(tokens(l.marca_veiculo));
        const resto = tokens(l.modelo_veiculo).filter(t => !marca.has(t));
        const chave = `${norm(l.marca_veiculo)}|${resto[0] || ''}`;
        if (!familias.has(l.imagem)) familias.set(l.imagem, new Set());
        familias.get(l.imagem).add(chave);
    }
    return new Set([...familias].filter(([, f]) => f.size >= 2).map(([url]) => url));
}

function classificarFoto(l, repetidas) {
    const url = String(l.imagem || '').trim();
    if (!url || ['undefined', 'null', 'none'].includes(url.toLowerCase())) return 'sem foto';
    if (FOTO_GENERICA.test(norm(url))) return 'sem foto';
    if (repetidas.has(url)) return 'ilustrativa';
    if (/(foto|imagem)s? (meramente )?ilustrativ/.test(norm(`${l.modelo_veiculo} ${l.observacao}`))) return 'ilustrativa';
    return 'real';
}

// ---------------------------------------------------------------- cálculo e veredito

function lanceBase(l) {
    const inicial = Number(l.lance_inicial) || 0;
    const atual = Number(l.lance_atual) || 0;
    const segunda = Number(l.lance_inicial_segunto_lote) || 0;
    if (atual > inicial && inicial > 0) return { lance: atual, lance1a: inicial, lance2a: segunda, praca: 'lance atual' };
    if (segunda > 0 && segunda < inicial) return { lance: segunda, lance1a: inicial, lance2a: segunda, praca: '2ª praça' };
    return { lance: inicial || atual, lance1a: inicial, lance2a: segunda, praca: '1ª praça' };
}

function calcular(l, a, fipe, foto, cfg) {
    const base = lanceBase(l);
    const debitos = a.taxas + (a.subrogacao ? 0 : a.debitos);
    const comissao = base.lance * cfg.comissaoLeiloeiro;
    const custoAquisicao = base.lance + comissao + debitos + cfg.custoDocumentacao + cfg.custoRemocao;
    const res = { ...base, comissao, debitosConsiderados: debitos, custoAquisicao };
    if (!fipe) return res;

    // sem foto real e sem descrição: assume o pior
    const condicao = foto !== 'real' && a.condicao === 'desconhecido' ? 'ruim' : a.condicao;
    let pctReparo = cfg.reparoPorCondicao[condicao];
    if (a.funciona === 'NÃO') pctReparo += cfg.reparoExtraNaoFunciona;
    const reparo = fipe * pctReparo;
    const revenda = fipe * (1 - cfg.desagioRevenda);
    const investimento = custoAquisicao + reparo;
    const lucro = revenda - investimento;
    return {
        ...res, descontoFipe: 1 - base.lance / fipe, reparo, revenda, investimento,
        lucro, margem: investimento ? lucro / investimento : null
    };
}

/** Recalcula custos e veredito de um resultado com os parâmetros atuais (sem rede). */
function avaliar(r, cfg) {
    const a = r.analise;
    const motivosDinamicos = new Set([MOTIVO_SINISTRO, ...Object.values(MOTIVO_FOTO)]);
    a.alertas = a.alertas.filter(x => !x.startsWith('Lance muito baixo') && !motivosDinamicos.has(x));
    a.bloqueios = a.bloqueios.filter(x => !motivosDinamicos.has(x));
    if (a.sinistro) (cfg.descartarSinistro ? a.bloqueios : a.alertas).push(MOTIVO_SINISTRO);
    if (MOTIVO_FOTO[r.foto]) (cfg.descartarSemFoto ? a.bloqueios : a.alertas).push(MOTIVO_FOTO[r.foto]);

    const c = r.calc = calcular(r.lote, a, r.fipe, r.foto, cfg);
    if (a.bloqueios.length) r.veredito = 'DESCARTAR';
    else if (!r.fipe) r.veredito = 'SEM FIPE';
    else if (c.lance < cfg.lanceSuspeitoPctFipe * r.fipe) {
        r.veredito = 'TALVEZ'; // lance simbólico (pregão/erro de cadastro): o preço final vai subir
        a.alertas.push(`Lance muito baixo vs FIPE (${Math.round(100 * c.lance / r.fipe)}%): o preço final tende a subir muito; confira se é mesmo leilão judicial`);
    } else if (c.margem >= cfg.margemMinima) r.veredito = 'VALE A PENA';
    else if (c.margem >= cfg.margemMinima / 2) r.veredito = 'TALVEZ';
    else r.veredito = 'DESCARTAR';
    return r;
}

const ORDEM_VEREDITO = { 'VALE A PENA': 0, TALVEZ: 1, 'SEM FIPE': 2, DESCARTAR: 3 };

function ordenarResultados(lista) {
    return lista.sort((x, y) => (ORDEM_VEREDITO[x.veredito] - ORDEM_VEREDITO[y.veredito])
        || ((y.calc.margem ?? -9) - (x.calc.margem ?? -9)));
}

module.exports = {
    CONFIG_PADRAO, norm, tokens, brlParaNumero, analisarTexto, acharSinistro, textoLote,
    imagensRepetidas, classificarFoto, lanceBase, calcular, avaliar, ordenarResultados,
    SUBROGACAO, DINHEIRO
};
