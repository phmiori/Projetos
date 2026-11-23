/**
 * JS/Leilao/radar.js
 * Sub-abas da página de Carros de Leilão e o Radar de Oportunidades: lista os carros de leilão
 * judicial do BuscaAii analisados pelo servidor (/api/radar), com filtros, detalhes do cálculo e
 * atalho para cadastrar o carro em "Meus Veículos". Usa formatarMoeda/escapeHTML/abrirModalCadastro
 * de leilao.js (carregado antes).
 */

const radarState = {
    dados: [],
    config: {},
    estado: {},
    vereditos: new Set(['VALE A PENA', 'TALVEZ']),
    limite: 48,
    carregado: false,
    timer: null,
    estavaRodando: false
};

const RADAR_VEREDITOS = [
    ['VALE A PENA', 'Vale a pena', 'ok'],
    ['TALVEZ', 'Talvez', 'talvez'],
    ['SEM FIPE', 'Sem FIPE', ''],
    ['DESCARTAR', 'Descartados', 'ruim']
];
const RADAR_CLASSE = { 'VALE A PENA': 'ok', TALVEZ: 'talvez', 'SEM FIPE': '', DESCARTAR: 'ruim' };
const RADAR_TIPOS = { CAR: 'Carros', PICKUP_TRUCK: 'Picapes', VAN: 'Vans', MOTORCYCLE: 'Motos', TRUCK: 'Caminhões' };

document.addEventListener('DOMContentLoaded', () => {
    initSubAbasLeilao();
    initRadarEventos();
    if (location.hash === '#radar') document.querySelector('[data-subtarget="leilaoSubRadar"]').click();
});

function initSubAbasLeilao() {
    document.querySelectorAll('.sub-nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.sub-nav-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.leilao-subview').forEach(v => v.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.dataset.subtarget).classList.add('active');
            const radar = btn.dataset.subtarget === 'leilaoSubRadar';
            history.replaceState(null, '', radar ? '#radar' : location.pathname);
            if (radar && !radarState.carregado) iniciarRadar();
        });
    });
}

async function iniciarRadar() {
    radarState.carregado = true;
    await atualizarEstadoRadar();
    await carregarResultadosRadar();
}

function initRadarEventos() {
    const rerender = () => { radarState.limite = 48; renderizarRadar(); };
    ['radarBusca', 'radarLanceMax'].forEach(id => document.getElementById(id).addEventListener('input', rerender));
    ['radarUF', 'radarPrazo', 'radarOrdem', 'radarFunciona', 'radarSemAlienacao'].forEach(id => document.getElementById(id).addEventListener('change', rerender));
    document.getElementById('radarBtnMais').addEventListener('click', () => { radarState.limite += 48; renderizarRadar(); });
    document.getElementById('radarBtnAtualizar').addEventListener('click', iniciarAnaliseRadar);
    document.getElementById('radarBtnCsv').addEventListener('click', exportarRadarCsv);
    document.getElementById('radarBtnConfig').addEventListener('click', abrirConfigRadar);
    document.getElementById('radarBtnLog').addEventListener('click', () => {
        const log = document.getElementById('radarLog');
        log.hidden = !log.hidden;
        document.getElementById('radarBtnLog').textContent = log.hidden ? 'Ver detalhes' : 'Ocultar detalhes';
    });
    document.getElementById('radarDetalhesFechar').addEventListener('click', () => fecharModalRadar('radarDetalhesOverlay'));
    document.getElementById('radarConfigFechar').addEventListener('click', () => fecharModalRadar('radarConfigOverlay'));
    document.getElementById('radarConfigCancelar').addEventListener('click', () => fecharModalRadar('radarConfigOverlay'));
    document.getElementById('radarConfigForm').addEventListener('submit', salvarConfigRadar);
    ['radarDetalhesOverlay', 'radarConfigOverlay'].forEach(id => {
        document.getElementById(id).addEventListener('click', (e) => { if (e.target.id === id) fecharModalRadar(id); });
    });
}

// ---------------------------------------------------------------- dados

async function carregarResultadosRadar() {
    try {
        const res = await fetch(`${API_BASE}/radar/resultados`);
        if (!res.ok) throw new Error();
        const json = await res.json();
        radarState.dados = json.resultados || [];
        radarState.config = json.config || {};
        document.getElementById('radarAtualizado').textContent = json.geradoEm
            ? `Última análise: ${new Date(json.geradoEm).toLocaleString('pt-BR')} · vale a pena = margem ≥ ${radarPct(radarState.config.margemMinima)}`
            : 'Carros de leilão judicial do BuscaAii comparados com a FIPE';
        preencherUFsRadar();
        renderizarRadar();
    } catch {
        document.getElementById('radarGrid').innerHTML = radarVazio('Não foi possível carregar o Radar', 'Verifique se o servidor está no ar e tente de novo.');
    }
}

async function atualizarEstadoRadar() {
    try {
        const res = await fetch(`${API_BASE}/radar/estado`);
        if (!res.ok) return;
        const e = radarState.estado = await res.json();

        document.getElementById('radarProgresso').hidden = !e.rodando;
        const btn = document.getElementById('radarBtnAtualizar');
        btn.disabled = e.rodando;
        btn.textContent = e.rodando ? 'Analisando...' : 'Atualizar análise';
        if (e.rodando) {
            document.getElementById('radarEtapa').textContent = e.etapa || 'Trabalhando...';
            const barra = document.getElementById('radarBarra');
            barra.classList.toggle('indeterminada', !e.total);
            barra.firstElementChild.style.width = e.total ? `${(100 * e.atual / e.total).toFixed(1)}%` : '';
            document.getElementById('radarContador').textContent = e.total ? `${e.atual} de ${e.total}` : '';
            document.getElementById('radarLog').textContent = (e.log || []).join('\n');
        }

        const aviso = document.getElementById('radarAviso');
        aviso.classList.toggle('erro', Boolean(e.erro && !e.rodando));
        if (!e.buscaaiiConfigurado) {
            aviso.innerHTML = 'O login do BuscaAii ainda não está configurado no servidor. Defina <b>BUSCAAII_EMAIL</b> e <b>BUSCAAII_SENHA</b> no <code>.env</code> (no Render: Environment) e reinicie o servidor.';
            aviso.hidden = false;
        } else if (e.erro && !e.rodando) {
            aviso.innerHTML = `<b>A última atualização falhou:</b> ${escapeHTML(e.erro)}`;
            aviso.hidden = false;
        } else {
            aviso.hidden = true;
        }

        if (radarState.estavaRodando && !e.rodando) await carregarResultadosRadar();
        radarState.estavaRodando = e.rodando;
        clearTimeout(radarState.timer);
        // enquanto analisa, o polling também mantém o servidor do Render acordado
        if (e.rodando) radarState.timer = setTimeout(atualizarEstadoRadar, 2000);
    } catch { /* sem conexão: tenta de novo na próxima ação */ }
}

async function iniciarAnaliseRadar() {
    const editais = Number(document.getElementById('radarEditais').value);
    const res = await fetch(`${API_BASE}/radar/analisar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ editais })
    });
    if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        alert(json.error || 'Não foi possível iniciar a análise.');
    }
    radarState.estavaRodando = true;
    atualizarEstadoRadar();
}

// ---------------------------------------------------------------- filtros e renderização

function radarUF(l) {
    const uf = String(l.estado || '').trim().toUpperCase().slice(0, 2);
    return /^[A-Z]{2}$/.test(uf) ? uf : '';
}

function radarDias(data) {
    if (!data) return null;
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    return Math.round((new Date(`${data.slice(0, 10)}T00:00:00`) - hoje) / 864e5);
}

function radarTextoDias(n) {
    if (n === null) return '';
    if (n <= 0) return 'Encerra hoje';
    return n === 1 ? 'Amanhã' : `${n} dias`;
}

function radarPct(v) {
    return v === null || v === undefined || Number.isNaN(v) ? '—' : `${Math.round(v * 100)}%`;
}

function radarMoeda(v) {
    return v === null || v === undefined ? '—' : formatarMoeda(v).replace(/,\d{2}$/, '');
}

function preencherUFsRadar() {
    const sel = document.getElementById('radarUF');
    const atual = sel.value;
    const ufs = [...new Set(radarState.dados.map(r => radarUF(r.lote)).filter(Boolean))].sort();
    sel.innerHTML = '<option value="">Todos os estados</option>' + ufs.map(u => `<option>${u}</option>`).join('');
    sel.value = ufs.includes(atual) ? atual : '';
}

function filtrarRadar() {
    const busca = document.getElementById('radarBusca').value.trim().toLowerCase();
    const uf = document.getElementById('radarUF').value;
    const lanceMax = Number(document.getElementById('radarLanceMax').value) || 0;
    const prazo = Number(document.getElementById('radarPrazo').value) || 0;
    const funciona = document.getElementById('radarFunciona').checked;
    const semAlienacao = document.getElementById('radarSemAlienacao').checked;
    return radarState.dados.filter(r => {
        const l = r.lote;
        if ((radarDias(l.data_encerramento) ?? 0) < 0) return false; // leilão já encerrado desde a última análise
        if (busca && !`${l.modelo_veiculo} ${l.cidade} ${l.estado} ${l.leiloeiro}`.toLowerCase().includes(busca)) return false;
        if (uf && radarUF(l) !== uf) return false;
        if (lanceMax && !(r.calc.lance > 0 && r.calc.lance <= lanceMax)) return false;
        if (prazo) { const d = radarDias(l.data_encerramento); if (d === null || d > prazo) return false; }
        if (funciona && r.analise.funciona !== 'sim') return false;
        if (semAlienacao && r.analise.alertas.some(a => a.startsWith('Alienação'))) return false;
        return true;
    });
}

function ordenarRadar(lista) {
    const chave = {
        margem: r => -(r.calc.margem ?? -99), lucro: r => -(r.calc.lucro ?? -1e12), desconto: r => -(r.calc.descontoFipe ?? -99),
        encerra: r => r.lote.data_encerramento || '9999', lance: r => r.calc.lance || 1e12
    }[document.getElementById('radarOrdem').value];
    const ordemVeredito = { 'VALE A PENA': 0, TALVEZ: 1, 'SEM FIPE': 2, DESCARTAR: 3 };
    return [...lista].sort((a, b) => {
        const v = ordemVeredito[a.veredito] - ordemVeredito[b.veredito]; // "Vale a pena" sempre antes de "Talvez"
        if (v) return v;
        const x = chave(a), y = chave(b);
        return x < y ? -1 : x > y ? 1 : 0;
    });
}

function renderizarRadar() {
    const base = filtrarRadar();
    const kpis = document.getElementById('radarKpis');
    kpis.innerHTML = RADAR_VEREDITOS.map(([v, nome, cls]) => `
        <button type="button" class="radar-kpi ${cls} ${radarState.vereditos.has(v) ? 'selecionado' : ''}" data-veredito="${v}" title="Clique para mostrar/ocultar">
            <span class="radar-kpi-valor">${base.filter(r => r.veredito === v).length.toLocaleString('pt-BR')}</span>
            <span class="radar-kpi-rotulo">${nome}</span>
        </button>`).join('');
    kpis.querySelectorAll('.radar-kpi').forEach(el => el.addEventListener('click', () => {
        const v = el.dataset.veredito;
        if (radarState.vereditos.has(v)) radarState.vereditos.delete(v); else radarState.vereditos.add(v);
        radarState.limite = 48;
        renderizarRadar();
    }));

    const lista = ordenarRadar(base.filter(r => radarState.vereditos.has(r.veredito)));
    const grid = document.getElementById('radarGrid');
    const mais = document.getElementById('radarBtnMais');
    document.getElementById('radarContagem').textContent = radarState.dados.length
        ? `Exibindo ${Math.min(lista.length, radarState.limite).toLocaleString('pt-BR')} de ${lista.length.toLocaleString('pt-BR')} carros (${radarState.dados.length.toLocaleString('pt-BR')} analisados)` : '';

    if (!radarState.dados.length) {
        grid.innerHTML = radarVazio('Nenhuma análise ainda', 'Clique em "Atualizar análise" para buscar os carros de leilão judicial no BuscaAii. A primeira vez leva alguns minutos.');
        mais.hidden = true;
        return;
    }
    if (!lista.length) {
        grid.innerHTML = radarVazio('Nada com esses filtros', 'Afrouxe os filtros ou clique nos totais acima para incluir outros vereditos.');
        mais.hidden = true;
        return;
    }
    grid.innerHTML = lista.slice(0, radarState.limite).map(criarCardRadarHTML).join('');
    grid.querySelectorAll('[data-radar-id]').forEach(el => el.addEventListener('click', () => abrirDetalhesRadar(el.dataset.radarId)));
    mais.hidden = lista.length <= radarState.limite;
    mais.textContent = `Mostrar mais (${(lista.length - radarState.limite).toLocaleString('pt-BR')} restantes)`;
}

function radarVazio(titulo, texto) {
    return `<div class="empty-state radar-vazio"><h3 class="empty-state-title">${titulo}</h3><p class="empty-state-desc">${texto}</p></div>`;
}

function radarFotoHTML(r, classe = '') {
    // foto genérica ("sem foto", logo do tribunal...) não é mostrada
    if (r.foto !== 'real' || !r.lote.imagem) return '';
    return `<img class="${classe}" loading="lazy" src="${escapeHTML(r.lote.imagem)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">`;
}

function radarChipsHTML(r) {
    const a = r.analise;
    const chips = [`<span class="car-tag radar-chip ${a.condicao === 'bom' ? 'ok' : a.condicao === 'ruim' ? 'ruim' : ''}">Estado: ${escapeHTML(a.condicao)}</span>`];
    if (a.funciona === 'sim') chips.push('<span class="car-tag radar-chip ok">Funciona</span>');
    if (a.funciona === 'NÃO') chips.push('<span class="car-tag radar-chip ruim">Não funciona</span>');
    a.bloqueios.forEach(b => chips.push(`<span class="car-tag radar-chip ruim">${escapeHTML(b)}</span>`));
    if (a.alertas.length) chips.push(`<span class="car-tag radar-chip talvez" title="${escapeHTML(a.alertas.join(' · '))}">⚠ ${a.alertas.length} alerta${a.alertas.length > 1 ? 's' : ''}</span>`);
    if ((r.editalStatus || '').startsWith('edital PDF')) chips.push('<span class="car-tag radar-chip ok">Edital lido</span>');
    return chips.join('');
}

function criarCardRadarHTML(r) {
    const l = r.lote, c = r.calc;
    const dias = radarDias(l.data_encerramento);
    const local = [l.cidade, radarUF(l)].filter(Boolean).join(' / ') || 'Local não informado';
    return `
        <article class="car-card radar-card" data-radar-id="${escapeHTML(l.id)}">
            <div class="radar-foto">
                <div class="radar-sem-foto">${{ real: 'foto não carregou (veja no leiloeiro)', ilustrativa: 'só foto ilustrativa' }[r.foto] || 'sem foto'}</div>
                ${radarFotoHTML(r)}
                <span class="radar-badge ${RADAR_CLASSE[r.veredito]}">${r.veredito}</span>
                ${dias !== null ? `<span class="radar-badge radar-prazo">${radarTextoDias(dias)}</span>` : ''}
            </div>
            <div class="radar-card-corpo">
                <div>
                    <div class="car-model-name">${escapeHTML(l.modelo_veiculo)} ${r.ano ? `<span class="radar-local">${r.ano}</span>` : ''}</div>
                    <div class="radar-local">${escapeHTML(local)} · ${escapeHTML(l.leiloeiro || '')}</div>
                </div>
                <div class="radar-numeros">
                    <div><small>Lance (${escapeHTML(c.praca)})</small><strong>${radarMoeda(c.lance)}</strong></div>
                    <div><small>FIPE</small><strong>${radarMoeda(r.fipe)}</strong></div>
                    <div><small>Lucro estimado</small><strong class="${c.lucro >= 0 ? 'radar-positivo' : 'radar-negativo'}">${radarMoeda(c.lucro ?? null)}</strong></div>
                    <div><small>Margem · desconto FIPE</small><strong>${radarPct(c.margem)} · ${radarPct(c.descontoFipe)}</strong></div>
                </div>
                <div class="radar-chips">${radarChipsHTML(r)}</div>
            </div>
        </article>`;
}

// ---------------------------------------------------------------- detalhes

function abrirDetalhesRadar(id) {
    const r = radarState.dados.find(x => String(x.lote.id) === String(id));
    if (!r) return;
    const l = r.lote, c = r.calc, a = r.analise, cfg = radarState.config;
    const dias = radarDias(l.data_encerramento);

    document.getElementById('radarDetalhesTitulo').textContent = `${l.modelo_veiculo || 'Veículo'} ${r.ano || ''}`;
    document.getElementById('radarDetalhesSub').textContent = [r.veredito, [l.cidade, radarUF(l)].filter(Boolean).join(' / '), l.leiloeiro,
        dias !== null ? `${radarTextoDias(dias)} (${new Date(`${l.data_encerramento.slice(0, 10)}T00:00:00`).toLocaleDateString('pt-BR')})` : ''].filter(Boolean).join(' · ');

    const conta = r.fipe ? `
        <tr><td>Lance considerado (${escapeHTML(c.praca)})</td><td>${radarMoeda(c.lance)}</td></tr>
        <tr><td>+ Comissão do leiloeiro (${radarPct(cfg.comissaoLeiloeiro)})</td><td>${radarMoeda(c.comissao)}</td></tr>
        <tr><td>+ Débitos / taxas do edital${a.subrogacao ? ' (débitos sub-rogados, só taxas)' : ''}</td><td>${radarMoeda(c.debitosConsiderados)}</td></tr>
        <tr><td>+ Documentação e transferência</td><td>${radarMoeda(cfg.custoDocumentacao)}</td></tr>
        <tr><td>+ Remoção / guincho</td><td>${radarMoeda(cfg.custoRemocao)}</td></tr>
        <tr><td>+ Reparo estimado (estado ${escapeHTML(a.condicao)}${a.funciona === 'NÃO' ? ', não funciona' : ''})</td><td>${radarMoeda(c.reparo)}</td></tr>
        <tr class="total"><td>= Investimento total</td><td>${radarMoeda(c.investimento)}</td></tr>
        <tr><td>Revenda estimada (FIPE ${radarMoeda(r.fipe)} − ${radarPct(cfg.desagioRevenda)})</td><td>${radarMoeda(c.revenda)}</td></tr>
        <tr class="total"><td>Lucro estimado · margem</td><td class="${c.lucro >= 0 ? 'radar-positivo' : 'radar-negativo'}">${radarMoeda(c.lucro)} · ${radarPct(c.margem)}</td></tr>`
        : `<tr><td>Lance considerado (${escapeHTML(c.praca)})</td><td>${radarMoeda(c.lance)}</td></tr>
           <tr><td colspan="2" class="radar-nota">Sem preço FIPE: ${escapeHTML(r.fipeStatus || 'não consultado')}. Não dá para calcular o lucro.</td></tr>`;

    const foto = { real: 'foto real do lote', 'sem foto': 'sem foto', ilustrativa: 'só foto ilustrativa/genérica' }[r.foto] || '—';
    document.getElementById('radarDetalhesCorpo').innerHTML = `
        ${radarFotoHTML(r, 'radar-detalhes-foto')}
        <div class="radar-detalhes-acoes">
            ${l.fonte ? `<a class="btn-missao-primary" href="${escapeHTML(l.fonte)}" target="_blank" rel="noopener">Abrir lote no leiloeiro ↗</a>` : ''}
            <button type="button" class="radar-btn-secundario" id="radarBtnCadastrar">Cadastrar em Meus Veículos</button>
        </div>
        ${a.bloqueios.length ? `<div><h3>Motivo do descarte</h3><ul class="radar-lista ruim">${a.bloqueios.map(b => `<li>${escapeHTML(b)}</li>`).join('')}</ul></div>` : ''}
        ${a.sinistro ? `<div><h3>Trecho que fala de sinistro</h3><div class="radar-texto">…${escapeHTML(a.sinistro)}…</div></div>` : ''}
        ${a.alertas.length ? `<div><h3>Alertas para conferir no edital</h3><ul class="radar-lista talvez">${a.alertas.map(b => `<li>${escapeHTML(b)}</li>`).join('')}</ul></div>` : ''}
        <div><h3>Conta</h3><table class="radar-conta">${conta}</table></div>
        <div><h3>Dados do lote</h3><dl class="radar-dados">
            <dt>Lance 1ª praça</dt><dd>${radarMoeda(c.lance1a || null)}</dd>
            <dt>Lance 2ª praça</dt><dd>${radarMoeda(c.lance2a || null)}</dd>
            <dt>Avaliação judicial</dt><dd>${radarMoeda(a.avaliacao)}</dd>
            <dt>Modelo FIPE usado</dt><dd>${escapeHTML(r.fipeModelo || r.fipeStatus || '—')}</dd>
            <dt>Estado de conservação</dt><dd>${escapeHTML(a.condicao)}</dd>
            <dt>Funciona?</dt><dd>${a.funciona === '?' ? 'não informado' : escapeHTML(a.funciona)}</dd>
            <dt>Foto</dt><dd>${foto}</dd>
            <dt>Débitos citados</dt><dd>${radarMoeda(a.debitos || null)}${a.subrogacao ? ' · edital fala em sub-rogação/livre de ônus' : ''}</dd>
            <dt>Edital</dt><dd>${escapeHTML(r.editalStatus || 'não lido (fora dos melhores ou desativado)')}</dd>
        </dl></div>
        ${l.observacao ? `<div><h3>Descrição do edital (BuscaAii)</h3><div class="radar-texto">${escapeHTML(l.observacao)}</div></div>` : ''}
        ${r.editalTrecho ? `<div><h3>Trecho do edital / página do leiloeiro</h3><div class="radar-texto">${escapeHTML(r.editalTrecho)}</div></div>` : ''}
        <p class="radar-nota">Estimativa automática por palavras-chave. Leia o edital completo e consulte o histórico do carro pela placa (sinistro, leilão, recall) antes de dar lance.</p>`;

    document.getElementById('radarBtnCadastrar').addEventListener('click', () => cadastrarDoRadar(r));
    document.getElementById('radarDetalhesOverlay').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function fecharModalRadar(id) {
    document.getElementById(id).classList.remove('active');
    document.body.style.overflow = '';
}

/** Abre o cadastro de "Meus Veículos" já preenchido com os dados do lote do Radar. */
function cadastrarDoRadar(r) {
    const l = r.lote, cfg = radarState.config;
    fecharModalRadar('radarDetalhesOverlay');
    abrirModalCadastro();
    const marca = l.marca_veiculo || '';
    const set = (id, valor) => { const el = document.getElementById(id); if (el && valor !== undefined && valor !== null) el.value = valor; };
    set('inputMarca', marca);
    set('inputModelo', String(l.modelo_veiculo || '').replace(new RegExp(`^${marca}\\s+`, 'i'), ''));
    set('inputAno', r.ano || '');
    set('inputLeiloeiro', l.leiloeiro || '');
    set('inputOrigem', 'Leilão Judicial');
    set('inputValorArremate', r.calc.lance || '');
    set('inputComissaoPct', Math.round((cfg.comissaoLeiloeiro ?? 0.05) * 1000) / 10);
    set('inputCustoGuincho', cfg.custoRemocao ?? 0);
    set('inputGastoDocumentacao', cfg.custoDocumentacao ?? 0);
    set('inputObservacoes', `Radar BuscaAii: ${l.fonte || ''}`.slice(0, 250));
    recalcularPrevisoesModal();
}

// ---------------------------------------------------------------- parâmetros

function abrirConfigRadar() {
    const cfg = radarState.config;
    const P = v => Math.round((v ?? 0) * 1000) / 10;
    const set = (id, v) => { document.getElementById(id).value = v; };
    set('rcMargem', P(cfg.margemMinima));
    set('rcComissao', P(cfg.comissaoLeiloeiro));
    set('rcDoc', cfg.custoDocumentacao ?? 0);
    set('rcRemocao', cfg.custoRemocao ?? 0);
    set('rcDesagio', P(cfg.desagioRevenda));
    set('rcSuspeito', P(cfg.lanceSuspeitoPctFipe));
    set('rcNaoFunc', P(cfg.reparoExtraNaoFunciona));
    const rp = cfg.reparoPorCondicao || {};
    set('rcRBom', P(rp.bom)); set('rcRReg', P(rp.regular)); set('rcRDesc', P(rp.desconhecido)); set('rcRRuim', P(rp.ruim));
    document.getElementById('rcSinistro').checked = cfg.descartarSinistro !== false;
    document.getElementById('rcSemFoto').checked = cfg.descartarSemFoto !== false;
    const tipos = cfg.tiposProduto || ['CAR'];
    document.getElementById('rcTipos').innerHTML = Object.entries(RADAR_TIPOS).map(([k, nome]) =>
        `<label class="radar-check"><input type="checkbox" value="${k}" ${tipos.includes(k) ? 'checked' : ''}> ${nome}</label>`).join('');
    document.getElementById('radarConfigOverlay').classList.add('active');
    document.body.style.overflow = 'hidden';
}

async function salvarConfigRadar(e) {
    e.preventDefault();
    const F = id => Number(document.getElementById(id).value) / 100;
    const corpo = {
        margemMinima: F('rcMargem'), comissaoLeiloeiro: F('rcComissao'),
        custoDocumentacao: Number(document.getElementById('rcDoc').value), custoRemocao: Number(document.getElementById('rcRemocao').value),
        desagioRevenda: F('rcDesagio'), lanceSuspeitoPctFipe: F('rcSuspeito'), reparoExtraNaoFunciona: F('rcNaoFunc'),
        reparoPorCondicao: { bom: F('rcRBom'), regular: F('rcRReg'), desconhecido: F('rcRDesc'), ruim: F('rcRRuim') },
        descartarSinistro: document.getElementById('rcSinistro').checked,
        descartarSemFoto: document.getElementById('rcSemFoto').checked,
        tiposProduto: [...document.querySelectorAll('#rcTipos input:checked')].map(i => i.value)
    };
    const btn = document.getElementById('radarConfigSalvar');
    btn.disabled = true;
    try {
        const res = await fetch(`${API_BASE}/radar/config`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo)
        });
        if (!res.ok) throw new Error();
        fecharModalRadar('radarConfigOverlay');
        await carregarResultadosRadar();
    } catch {
        alert('Não foi possível salvar os parâmetros do Radar.');
    } finally {
        btn.disabled = false;
    }
}

// ---------------------------------------------------------------- exportação

function exportarRadarCsv() {
    const lista = ordenarRadar(filtrarRadar().filter(r => radarState.vereditos.has(r.veredito)));
    if (!lista.length) return alert('Nada para exportar com os filtros atuais.');
    const num = v => (v === null || v === undefined ? '' : String(Math.round(v)));
    const linhas = [['Veredito', 'Veículo', 'Ano', 'Cidade', 'UF', 'Encerra', 'Leiloeiro', 'Praça', 'Lance', 'FIPE', 'Lucro', 'Margem %',
        'Estado', 'Funciona', 'Alertas', 'Link']];
    lista.forEach(r => linhas.push([r.veredito, r.lote.modelo_veiculo, r.ano || '', r.lote.cidade || '', radarUF(r.lote), r.lote.data_encerramento || '',
        r.lote.leiloeiro || '', r.calc.praca, num(r.calc.lance), num(r.fipe), num(r.calc.lucro), r.calc.margem === undefined ? '' : num((r.calc.margem || 0) * 100),
        r.analise.condicao, r.analise.funciona, [...r.analise.bloqueios, ...r.analise.alertas].join(' | '), r.lote.fonte || '']));
    const csv = linhas.map(l => l.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    link.download = `radar_leiloes_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
}
