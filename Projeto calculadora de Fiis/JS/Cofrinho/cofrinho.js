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
    tema: localStorage.getItem('financehub_theme') || 'dark',
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

// =========================================================
// 2. INICIALIZAÇÃO
// =========================================================

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initMobileNav();
    initEventListeners();
    carregarCofrinhos();
});

function initTheme() {
    const root = document.documentElement;
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    const themeLabel = document.getElementById('themeLabel');

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
        if (themeLabel) {
            themeLabel.textContent = theme === 'dark' ? 'Modo Claro' : 'Modo Escuro';
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
    const btnNovoCofrinhoHeader = document.getElementById('btnNovoCofrinhoHeader');
    const btnAdicionarCofrinho = document.getElementById('btnAdicionarCofrinho');
    if (btnNovoCofrinhoHeader) btnNovoCofrinhoHeader.addEventListener('click', () => abrirModalCofrinho());
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
 * Calcula quantos dias se passaram desde o início (o próprio dia de início conta como Dia 1)
 */
function calcularDiasInvestidos(dataInicio) {
    const inicio = new Date(dataInicio);
    inicio.setHours(0, 0, 0, 0);

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const diffDias = Math.floor((hoje - inicio) / (1000 * 60 * 60 * 24)) + 1;
    return Math.max(1, diffDias);
}

/**
 * Calcula as métricas atuais de um cofrinho: rendimento bruto acumulado, IOF vigente e saldo líquido
 */
function calcularMetricasCofrinho(item) {
    const dias = calcularDiasInvestidos(item.dataInicio);
    const rendimentoBruto = item.rendaPorDia * dias;
    const saldoBruto = item.valorInvestido + rendimentoBruto;
    const iofPct = obterPercentualIOF(dias);
    const iofValor = rendimentoBruto * (iofPct / 100);
    const saldoLiquido = saldoBruto - iofValor;

    return { dias, rendimentoBruto, saldoBruto, iofPct, iofValor, saldoLiquido };
}

/**
 * Gera a projeção automática dia a dia (1 a 30) com base no valor investido e na renda diária fixa
 */
function gerarProjecao(item) {
    const linhas = [];
    for (let dia = 1; dia <= 30; dia++) {
        const rendimentoBruto = item.rendaPorDia * dia;
        const saldoBruto = item.valorInvestido + rendimentoBruto;
        const iofPct = obterPercentualIOF(dia);
        const iofValor = rendimentoBruto * (iofPct / 100);
        const saldoLiquido = saldoBruto - iofValor;
        linhas.push({ dia, saldoBruto, rendimentoBruto, iofPct, iofValor, saldoLiquido });
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
        totalRendaDia += item.rendaPorDia;
        totalRendimentoBruto += metricas.rendimentoBruto;
        totalSaldoLiquido += metricas.saldoLiquido;
        return { item, metricas };
    });

    document.getElementById('kpiCofreValorInvestido').textContent = formatarMoeda(totalInvestido);
    document.getElementById('kpiCofreRendaDia').textContent = formatarMoeda(totalRendaDia);
    document.getElementById('kpiCofreRendimentoBruto').textContent = formatarMoeda(totalRendimentoBruto);
    document.getElementById('kpiCofreSaldoLiquido').textContent = formatarMoeda(totalSaldoLiquido);

    const badgeCofrinhoCount = document.getElementById('badgeCofrinhoCount');
    if (badgeCofrinhoCount) badgeCofrinhoCount.textContent = list.length;

    const tbody = document.getElementById('cofrinhoTableBody');
    if (!tbody) return;

    if (list.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 32px; color: var(--text-sub);">
                    Nenhum Cofrinho cadastrado ainda. Clique em "<strong>Novo Cofrinho</strong>" acima para começar!
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
            <td><strong style="color: var(--color-income);">${formatarMoeda(item.rendaPorDia)}</strong></td>
            <td>${metricas.dias}º dia</td>
            <td>${formatarMoeda(metricas.rendimentoBruto)}</td>
            <td>${metricas.iofPct > 0
                ? `<span style="color: var(--color-expense); font-weight: 700;">${metricas.iofPct}% (${formatarMoeda(metricas.iofValor)})</span>`
                : `<span style="color: var(--color-income); font-weight: 700;">Isento</span>`}</td>
            <td><strong style="color: var(--text-main);">${formatarMoeda(metricas.saldoLiquido)}</strong></td>
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

    const diaAtual = calcularDiasInvestidos(item.dataInicio);
    const linhas = gerarProjecao(item);

    const tbody = document.getElementById('projecaoTableBody');
    tbody.innerHTML = linhas.map(l => `
        <tr class="${l.dia === diaAtual ? 'linha-hoje' : ''}">
            <td>${l.dia}º dia${l.dia === diaAtual ? ' (hoje)' : ''}</td>
            <td>${formatarMoeda(l.saldoBruto)}</td>
            <td style="color: var(--color-income);">${formatarMoeda(l.rendimentoBruto)}</td>
            <td>${l.iofPct > 0 ? `<span style="color: var(--color-expense);">${l.iofPct}%</span>` : `<span style="color: var(--color-income);">Isento</span>`}</td>
            <td>${l.iofPct > 0 ? formatarMoeda(l.iofValor) : '—'}</td>
            <td><strong>${formatarMoeda(l.saldoLiquido)}</strong></td>
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
