/**
 * JS/Cofrinho/cofrinho.js
 * Lógica do Módulo Cofrinho (Renda Diária): cadastro, projeção automática dia a dia
 * e cálculo do IOF regressivo (Decreto 6.306/2007) sobre o rendimento.
 */

// =========================================================
// 1. ESTADO GLOBAL & TABELA OFICIAL DE IOF REGRESSIVO
// =========================================================

const API_BASE = '/api';

const stateCofrinho = {
    cofrinhos: [],
    tema: (typeof localStorage !== 'undefined' ? localStorage.getItem('financehub_theme') : null) || 'dark',
    cofrinhoEmProjecao: null
};

// Percentual de IOF sobre o rendimento, conforme os dias corridos desde a aplicação (dia 30 em diante: isento)
const TABELA_IOF_REGRESSIVO = {
    1: 96, 2: 93, 3: 90, 4: 86, 5: 83, 6: 80, 7: 76, 8: 73, 9: 70, 10: 66,
    11: 63, 12: 60, 13: 56, 14: 53, 15: 50, 16: 46, 17: 43, 18: 40, 19: 36, 20: 33,
    21: 30, 22: 26, 23: 23, 24: 20, 25: 16, 26: 13, 27: 10, 28: 6, 29: 3, 30: 0
};

function obterPercentualIOF(dias) {
    if (dias >= 30) return 0;
    if (dias <= 0) return TABELA_IOF_REGRESSIVO[1];
    return TABELA_IOF_REGRESSIVO[dias] ?? 0;
}

// Percentual de Imposto de Renda sobre o rendimento, conforme os dias corridos desde a aplicação
// (tabela regressiva de renda fixa: sempre incide, mesmo após os 30 dias em que o IOF já é isento)
function obterPercentualIR(dias) {
    if (dias <= 180) return 22.5;
    if (dias <= 360) return 20;
    if (dias <= 720) return 17.5;
    return 15;
}

// =========================================================
// 1.1 CALENDÁRIO DE DIAS ÚTEIS (a renda só é creditada em dias úteis,
// pois o CDI não acumula em fins de semana e feriados nacionais)
// =========================================================

const cacheFeriadosPorAno = {};

/**
 * Calcula a data da Páscoa de um ano (Algoritmo de Meeus/Jones/Butcher),
 * usada como base dos feriados móveis (Carnaval, Sexta-Feira Santa e Corpus Christi)
 */
function calcularPascoa(ano) {
    const a = ano % 19;
    const b = Math.floor(ano / 100);
    const c = ano % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const mes = Math.floor((h + l - 7 * m + 114) / 31);
    const dia = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(ano, mes - 1, dia);
}

function formatarDataChave(data) {
    const y = data.getFullYear();
    const m = String(data.getMonth() + 1).padStart(2, '0');
    const d = String(data.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/**
 * Retorna o conjunto de feriados nacionais (fixos + móveis) de um ano específico
 */
function obterFeriadosNacionais(ano) {
    if (cacheFeriadosPorAno[ano]) return cacheFeriadosPorAno[ano];

    const feriados = new Set();
    const somarDias = (data, dias) => {
        const nova = new Date(data);
        nova.setDate(nova.getDate() + dias);
        return nova;
    };
    const addData = (data) => feriados.add(formatarDataChave(data));

    // Feriados fixos
    addData(new Date(ano, 0, 1));    // Confraternização Universal
    addData(new Date(ano, 3, 21));   // Tiradentes
    addData(new Date(ano, 4, 1));    // Dia do Trabalho
    addData(new Date(ano, 8, 7));    // Independência do Brasil
    addData(new Date(ano, 9, 12));   // Nossa Senhora Aparecida
    addData(new Date(ano, 10, 2));   // Finados
    addData(new Date(ano, 10, 15));  // Proclamação da República
    addData(new Date(ano, 10, 20));  // Dia da Consciência Negra
    addData(new Date(ano, 11, 25));  // Natal

    // Feriados móveis (baseados na Páscoa)
    const pascoa = calcularPascoa(ano);
    addData(somarDias(pascoa, -48)); // Carnaval (Segunda-feira)
    addData(somarDias(pascoa, -47)); // Carnaval (Terça-feira)
    addData(somarDias(pascoa, -2));  // Sexta-feira Santa
    addData(somarDias(pascoa, 60));  // Corpus Christi

    cacheFeriadosPorAno[ano] = feriados;
    return feriados;
}

/**
 * Verifica se uma data é dia útil (não é sábado, domingo ou feriado nacional)
 */
function ehDiaUtil(data) {
    const diaSemana = data.getDay();
    if (diaSemana === 0 || diaSemana === 6) return false;

    const feriados = obterFeriadosNacionais(data.getFullYear());
    return !feriados.has(formatarDataChave(data));
}

// =========================================================
// 2. INICIALIZAÇÃO
// =========================================================

// Guarda de ambiente: este arquivo também é `require`ado pelos testes (node:test), onde
// `document` não existe. No navegador, `typeof document` é sempre 'object'.
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        initTheme();
        initMobileNav();
        initEventListeners();
        carregarCofrinhos();
    });
}

function initTheme() {
    const root = document.documentElement;
    const themeToggleBtn = document.getElementById('themeToggleBtn');

    applyTheme(stateCofrinho.tema);

    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            stateCofrinho.tema = stateCofrinho.tema === 'dark' ? 'light' : 'dark';
            applyTheme(stateCofrinho.tema);
            localStorage.setItem('financehub_theme', stateCofrinho.tema);
        });
    }

    function applyTheme(theme) {
        root.setAttribute('data-theme', theme);
        if (themeToggleBtn) {
            themeToggleBtn.setAttribute('aria-checked', theme === 'light' ? 'true' : 'false');
        }
    }
}

function initMobileNav() {
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const appSidebar = document.getElementById('appSidebar');
    const sidebarBackdrop = document.getElementById('sidebarBackdrop');

    if (!mobileMenuBtn || !appSidebar || !sidebarBackdrop) return;

    mobileMenuBtn.addEventListener('click', () => {
        appSidebar.classList.toggle('open');
        sidebarBackdrop.classList.toggle('active');
    });

    sidebarBackdrop.addEventListener('click', () => {
        appSidebar.classList.remove('open');
        sidebarBackdrop.classList.remove('active');
    });
}

function initEventListeners() {
    const btnAdicionarCofrinho = document.getElementById('btnAdicionarCofrinho');
    if (btnAdicionarCofrinho) btnAdicionarCofrinho.addEventListener('click', () => abrirModalCofrinho());

    const modalCofrinhoClose = document.getElementById('modalCofrinhoClose');
    const btnCofrinhoCancel = document.getElementById('btnCofrinhoCancel');
    const modalCofrinhoOverlay = document.getElementById('modalCofrinhoOverlay');

    if (modalCofrinhoClose) modalCofrinhoClose.addEventListener('click', fecharModalCofrinho);
    if (btnCofrinhoCancel) btnCofrinhoCancel.addEventListener('click', fecharModalCofrinho);
    if (modalCofrinhoOverlay) {
        modalCofrinhoOverlay.addEventListener('click', (e) => {
            if (e.target === modalCofrinhoOverlay) fecharModalCofrinho();
        });
    }

    const modalProjecaoClose = document.getElementById('modalProjecaoClose');
    const btnProjecaoFechar = document.getElementById('btnProjecaoFechar');
    const modalProjecaoOverlay = document.getElementById('modalProjecaoOverlay');

    if (modalProjecaoClose) modalProjecaoClose.addEventListener('click', fecharModalProjecao);
    if (btnProjecaoFechar) btnProjecaoFechar.addEventListener('click', fecharModalProjecao);
    if (modalProjecaoOverlay) {
        modalProjecaoOverlay.addEventListener('click', (e) => {
            if (e.target === modalProjecaoOverlay) fecharModalProjecao();
        });
    }

    const cofrinhoForm = document.getElementById('cofrinhoForm');
    if (cofrinhoForm) cofrinhoForm.addEventListener('submit', salvarCofrinho);
}

// =========================================================
// 3. CARREGAMENTO & CÁLCULO
// =========================================================

async function carregarCofrinhos() {
    try {
        const response = await fetch(`${API_BASE}/cofrinhos`);
        if (!response.ok) throw new Error('API indisponível');

        stateCofrinho.cofrinhos = await response.json();
    } catch (err) {
        console.error('[Cofrinho] Erro ao carregar cofrinhos:', err.message);
        stateCofrinho.cofrinhos = [];
    }

    renderizarCofrinhos();
}

/**
 * Interpreta uma data (string "YYYY-MM-DD" ou ISO vindo da API) como meia-noite no fuso
 * LOCAL, evitando o bug de `new Date("YYYY-MM-DD")` ser interpretado em UTC e "voltar"
 * um dia em fusos negativos (ex: Brasil, UTC-3) ao ler getDay()/getDate().
 */
function parseDataLocal(valor) {
    const match = String(valor).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
        const [, ano, mes, dia] = match;
        return new Date(Number(ano), Number(mes) - 1, Number(dia));
    }
    return new Date(valor);
}

/**
 * Calcula quantos dias corridos se passaram desde o início (o próprio dia de início conta como Dia 1).
 * O prazo do IOF regressivo é contado em dias corridos, conforme o Decreto 6.306/2007.
 */
function calcularDiasCorridos(dataInicio) {
    const inicio = parseDataLocal(dataInicio);
    inicio.setHours(0, 0, 0, 0);

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const diffDias = Math.floor((hoje - inicio) / (1000 * 60 * 60 * 24)) + 1;
    return Math.max(1, diffDias);
}

/**
 * Conta quantos dos "diasCorridos" a partir de dataInicio são dias úteis (a renda só é
 * creditada nesses dias, pois o CDI não acumula em fins de semana e feriados nacionais)
 */
function contarDiasUteis(dataInicio, diasCorridos) {
    const inicio = parseDataLocal(dataInicio);
    inicio.setHours(0, 0, 0, 0);

    let uteis = 0;
    for (let i = 0; i < diasCorridos; i++) {
        const data = new Date(inicio);
        data.setDate(data.getDate() + i);
        if (ehDiaUtil(data)) uteis++;
    }
    return uteis;
}

/**
 * Deriva a taxa diária implícita do cofrinho a partir da renda recebida no Dia 1
 * (informada uma única vez), dividindo-a pelo valor investido. Como o rendimento
 * diário real muda constantemente (CDI/Selic variam dia a dia), usamos essa taxa
 * do primeiro dia como aproximação constante, aplicada sobre o saldo total.
 */
function taxaDiariaDoItem(item) {
    return item.valorInvestido > 0 ? item.rendaPorDia / item.valorInvestido : 0;
}

/**
 * Calcula as métricas atuais de um cofrinho: saldo bruto com juros compostos sobre o
 * valor total (a taxa diária incide sobre o saldo já rendido, não apenas sobre o
 * valor original), IOF e IR vigentes (em dias corridos) e saldo líquido.
 * Ordem oficial de apuração: o IOF é descontado primeiro sobre o rendimento bruto,
 * e o IR incide depois sobre o que sobrar (rendimento já líquido de IOF) — não sobre o bruto.
 */
function calcularMetricasCofrinho(item) {
    const diasCorridos = calcularDiasCorridos(item.dataInicio);
    const diasUteis = contarDiasUteis(item.dataInicio, diasCorridos);
    const taxaDiaria = taxaDiariaDoItem(item);
    const saldoBruto = item.valorInvestido * Math.pow(1 + taxaDiaria, diasUteis);
    const rendimentoBruto = saldoBruto - item.valorInvestido;
    const rendaDiariaAtual = saldoBruto * taxaDiaria;
    const iofPct = obterPercentualIOF(diasCorridos);
    const iofValor = rendimentoBruto * (iofPct / 100);
    const rendimentoAposIOF = rendimentoBruto - iofValor;
    const irPct = obterPercentualIR(diasCorridos);
    const irValor = rendimentoAposIOF * (irPct / 100);
    const saldoLiquido = saldoBruto - iofValor - irValor;

    return { diasCorridos, diasUteis, rendimentoBruto, saldoBruto, rendaDiariaAtual, iofPct, iofValor, irPct, irValor, saldoLiquido };
}

/**
 * Gera a projeção automática dia a dia (1 a 30 dias corridos), somando renda apenas
 * nos dias úteis e aplicando o IOF regressivo e o IR regressivo conforme o prazo em dias corridos
 */
function gerarProjecao(item) {
    const inicio = parseDataLocal(item.dataInicio);
    inicio.setHours(0, 0, 0, 0);
    const taxaDiaria = taxaDiariaDoItem(item);

    const linhas = [];
    let diasUteisAcumulados = 0;

    for (let dia = 1; dia <= 30; dia++) {
        const dataDoDia = new Date(inicio);
        dataDoDia.setDate(dataDoDia.getDate() + (dia - 1));

        const diaUtil = ehDiaUtil(dataDoDia);
        if (diaUtil) diasUteisAcumulados++;

        const saldoBruto = item.valorInvestido * Math.pow(1 + taxaDiaria, diasUteisAcumulados);
        const rendimentoBruto = saldoBruto - item.valorInvestido;
        const iofPct = obterPercentualIOF(dia);
        const iofValor = rendimentoBruto * (iofPct / 100);
        const rendimentoAposIOF = rendimentoBruto - iofValor;
        const irPct = obterPercentualIR(dia);
        const irValor = rendimentoAposIOF * (irPct / 100);
        const saldoLiquido = saldoBruto - iofValor - irValor;

        linhas.push({ dia, diaUtil, diasUteisAcumulados, saldoBruto, rendimentoBruto, iofPct, iofValor, irPct, irValor, saldoLiquido });
    }
    return linhas;
}

// =========================================================
// 4. RENDERIZAÇÃO
// =========================================================

function renderizarCofrinhos() {
    const list = stateCofrinho.cofrinhos;

    let totalInvestido = 0;
    let totalRendaDia = 0;
    let totalRendimentoBruto = 0;
    let totalSaldoLiquido = 0;

    const linhas = list.map(item => {
        const metricas = calcularMetricasCofrinho(item);
        totalInvestido += item.valorInvestido;
        totalRendaDia += metricas.rendaDiariaAtual;
        totalRendimentoBruto += metricas.rendimentoBruto;
        totalSaldoLiquido += metricas.saldoLiquido;
        return { item, metricas };
    });

    document.getElementById('kpiCofreValorInvestido').textContent = formatarMoeda(totalInvestido);
    document.getElementById('kpiCofreRendaDia').textContent = formatarMoeda(totalRendaDia);
    document.getElementById('kpiCofreRendimentoBruto').textContent = formatarMoeda(totalRendimentoBruto);

    const kpiSaldoLiquido = document.getElementById('kpiCofreSaldoLiquido');
    const kpiSaldoLiquidoTag = document.getElementById('kpiCofreSaldoLiquidoTag');
    const prejuizo = totalSaldoLiquido < totalInvestido;
    kpiSaldoLiquido.textContent = formatarMoeda(totalSaldoLiquido);
    kpiSaldoLiquido.className = 'kpi-value' + (prejuizo ? ' text-expense' : '');
    if (kpiSaldoLiquidoTag) {
        kpiSaldoLiquidoTag.textContent = prejuizo
            ? 'Abaixo do valor investido — IOF + IR consomem todo o rendimento'
            : 'Se resgatasse tudo agora (após IOF e IR)';
        kpiSaldoLiquidoTag.className = 'kpi-status-tag ' + (prejuizo ? 'tag-expense' : 'tag-accent');
    }

    const badgeCofrinhoCount = document.getElementById('badgeCofrinhoCount');
    if (badgeCofrinhoCount) badgeCofrinhoCount.textContent = list.length;

    const tbody = document.getElementById('cofrinhoTableBody');
    if (!tbody) return;

    if (list.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" style="padding: 0;">
                    <div class="empty-state">
                        <span class="empty-state-icon">🐷</span>
                        <p class="empty-state-title">Nenhum cofrinho cadastrado</p>
                        <p class="empty-state-text">Cadastre seu primeiro cofrinho para acompanhar o rendimento diário líquido de IOF e IR.</p>
                        <button type="button" class="btn-missao-primary" onclick="abrirModalCofrinho(null)">+ Novo Cofrinho</button>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = linhas.map(({ item, metricas }) => `
        <tr>
            <td>
                <span class="cofre-name-cell">${escapeHTML(item.nome)}</span>
                ${item.observacoes ? `<div style="font-size: 0.75rem; color: var(--text-sub); margin-top: 4px;">${escapeHTML(item.observacoes)}</div>` : ''}
            </td>
            <td>${formatarMoeda(item.valorInvestido)}</td>
            <td><strong style="color: var(--color-income);">${formatarMoeda(metricas.rendaDiariaAtual)}</strong></td>
            <td>${metricas.diasCorridos}º dia corrido
                <div style="font-size: 0.75rem; color: var(--text-sub);">${metricas.diasUteis} dia(s) útil(eis)</div>
            </td>
            <td>${formatarMoeda(metricas.rendimentoBruto)}</td>
            <td>${metricas.iofPct > 0
                ? `<span style="color: var(--color-expense); font-weight: 700;">${metricas.iofPct}% (${formatarMoeda(metricas.iofValor)})</span>`
                : `<span style="color: var(--color-income); font-weight: 700;">Isento</span>`}</td>
            <td><span style="color: var(--color-expense); font-weight: 700;">${metricas.irPct}% (${formatarMoeda(metricas.irValor)})</span></td>
            <td>
                <strong style="color: ${metricas.saldoLiquido < item.valorInvestido ? 'var(--color-expense)' : 'var(--text-main)'};">${formatarMoeda(metricas.saldoLiquido)}</strong>
                ${metricas.saldoLiquido < item.valorInvestido ? '<div style="font-size: 0.72rem; color: var(--color-expense);">Abaixo do investido</div>' : ''}
            </td>
            <td>
                <div class="table-action-btns">
                    <button class="btn-cofre-action" onclick="abrirModalProjecao('${item.id}')" title="Ver projeção dia a dia">
                        📅 Projeção
                    </button>
                    <button class="btn-cofre-action" onclick="abrirModalCofrinho('${item.id}')" title="Editar Cofrinho">
                        ✏️
                    </button>
                    <button class="btn-cofre-action delete" onclick="excluirCofrinho('${item.id}')" title="Excluir Cofrinho">
                        🗑️
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

// =========================================================
// 5. MODAL: ADICIONAR / EDITAR COFRINHO
// =========================================================

function abrirModalCofrinho(id = null) {
    const form = document.getElementById('cofrinhoForm');
    form.reset();

    if (id) {
        const item = stateCofrinho.cofrinhos.find(i => String(i.id) === String(id));
        if (item) {
            document.getElementById('modalCofrinhoTitle').textContent = `Editar: ${item.nome}`;
            document.getElementById('formCofrinhoId').value = item.id;
            document.getElementById('inputCofrinhoNome').value = item.nome;
            document.getElementById('inputCofrinhoValor').value = item.valorInvestido;
            document.getElementById('inputCofrinhoRendaDia').value = item.rendaPorDia;
            document.getElementById('inputCofrinhoDataInicio').value = new Date(item.dataInicio).toISOString().slice(0, 10);
            document.getElementById('inputCofrinhoObs').value = item.observacoes || '';
        }
    } else {
        document.getElementById('modalCofrinhoTitle').textContent = 'Novo Cofrinho';
        document.getElementById('formCofrinhoId').value = '';
        document.getElementById('inputCofrinhoDataInicio').value = new Date().toISOString().slice(0, 10);
    }

    document.getElementById('modalCofrinhoOverlay').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function fecharModalCofrinho() {
    document.getElementById('modalCofrinhoOverlay').classList.remove('active');
    document.body.style.overflow = '';
}

async function salvarCofrinho(e) {
    e.preventDefault();

    const id = document.getElementById('formCofrinhoId').value;
    const nome = document.getElementById('inputCofrinhoNome').value.trim();
    const valorInvestido = parseFloat(document.getElementById('inputCofrinhoValor').value) || 0;
    const rendaPorDia = parseFloat(document.getElementById('inputCofrinhoRendaDia').value) || 0;
    const dataInicio = document.getElementById('inputCofrinhoDataInicio').value;
    const observacoes = document.getElementById('inputCofrinhoObs').value.trim();

    if (!nome || valorInvestido <= 0 || rendaPorDia <= 0) {
        alert('Preencha os campos obrigatórios corretamente.');
        return;
    }

    const payload = { nome, valorInvestido, rendaPorDia, dataInicio, observacoes };

    try {
        const url = id ? `${API_BASE}/cofrinhos/${id}` : `${API_BASE}/cofrinhos`;
        const response = await fetch(url, {
            method: id ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error('Falha ao salvar cofrinho');

        fecharModalCofrinho();
        await carregarCofrinhos();
    } catch (err) {
        console.error('Erro ao salvar cofrinho:', err);
        alert('Erro ao salvar o Cofrinho.');
    }
}

async function excluirCofrinho(id) {
    const item = stateCofrinho.cofrinhos.find(i => String(i.id) === String(id));
    if (!item) return;

    if (!confirm(`Tem certeza que deseja remover o cofrinho "${item.nome}"?`)) return;

    try {
        const response = await fetch(`${API_BASE}/cofrinhos/${id}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Falha ao excluir cofrinho');

        await carregarCofrinhos();
    } catch (err) {
        console.error('Erro ao excluir cofrinho:', err);
        alert('Erro ao excluir o Cofrinho.');
    }
}

// =========================================================
// 6. MODAL: PROJEÇÃO AUTOMÁTICA DE 30 DIAS
// =========================================================

function abrirModalProjecao(id) {
    const item = stateCofrinho.cofrinhos.find(i => String(i.id) === String(id));
    if (!item) return;

    stateCofrinho.cofrinhoEmProjecao = item;
    document.getElementById('projecaoModalTitle').textContent = `Projeção: ${item.nome}`;

    const diaAtual = calcularDiasCorridos(item.dataInicio);
    const linhas = gerarProjecao(item);

    const tbody = document.getElementById('projecaoTableBody');
    tbody.innerHTML = linhas.map(l => `
        <tr class="${l.dia === diaAtual ? 'linha-hoje' : ''}">
            <td>
                ${l.dia}º dia${l.dia === diaAtual ? ' (hoje)' : ''}
                ${!l.diaUtil ? '<div style="font-size: 0.72rem; color: var(--text-sub);">Fim de semana/feriado — sem renda</div>' : ''}
            </td>
            <td>${formatarMoeda(l.saldoBruto)}</td>
            <td style="color: var(--color-income);">${formatarMoeda(l.rendimentoBruto)}</td>
            <td>${l.iofPct > 0 ? `<span style="color: var(--color-expense);">${l.iofPct}%</span>` : `<span style="color: var(--color-income);">Isento</span>`}</td>
            <td>${l.iofPct > 0 ? formatarMoeda(l.iofValor) : '—'}</td>
            <td><span style="color: var(--color-expense);">${l.irPct}%</span></td>
            <td>${formatarMoeda(l.irValor)}</td>
            <td><strong style="${l.saldoLiquido < item.valorInvestido ? 'color: var(--color-expense);' : ''}">${formatarMoeda(l.saldoLiquido)}</strong></td>
        </tr>
    `).join('');

    document.getElementById('modalProjecaoOverlay').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function fecharModalProjecao() {
    document.getElementById('modalProjecaoOverlay').classList.remove('active');
    document.body.style.overflow = '';
}

// =========================================================
// 7. UTILITÁRIOS
// =========================================================

function formatarMoeda(valor) {
    const num = Number(valor) || 0;
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function escapeHTML(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Exportação para node:test (no-op no navegador, onde `module` não existe)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        obterPercentualIOF,
        obterPercentualIR,
        calcularDiasCorridos,
        contarDiasUteis,
        taxaDiariaDoItem,
        calcularMetricasCofrinho,
        TABELA_IOF_REGRESSIVO
    };
}
