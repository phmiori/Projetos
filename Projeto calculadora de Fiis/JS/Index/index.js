/**
 * JS/Index/index.js
 * Lógica da Visão Geral Consolidada (FinanceHub)
 * Carrega métricas consolidadas dos módulos, gerencia tema e navegação global
 */

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initMobileNavigation();
    initDateDisplay();
    carregarMetricasConsolidadas();
    carregarBadgeCofrinho();
});

async function carregarBadgeCofrinho() {
    const badge = document.getElementById('badgeCofrinhoCountIndex');
    if (!badge) return;

    try {
        const response = await fetch('/api/cofrinhos');
        if (!response.ok) throw new Error('API indisponível');
        const cofrinhos = await response.json();
        badge.textContent = cofrinhos.length;
    } catch (err) {
        console.warn('[FinanceHub] Não foi possível carregar o total de cofrinhos.', err.message);
    }
}

function initTheme() {
    const STORAGE_KEY = 'financehub_theme';
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    const themeLabel = document.getElementById('themeLabel');
    const rootElement = document.documentElement;

    const savedTheme = localStorage.getItem(STORAGE_KEY) || 'dark';
    applyTheme(savedTheme);

    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            const currentTheme = rootElement.getAttribute('data-theme') || 'dark';
            const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
            applyTheme(nextTheme);
            localStorage.setItem(STORAGE_KEY, nextTheme);
        });
    }

    function applyTheme(theme) {
        rootElement.setAttribute('data-theme', theme);
        if (themeLabel) {
            themeLabel.textContent = theme === 'dark' ? 'Modo Claro' : 'Modo Escuro';
        }
    }
}

function initMobileNavigation() {
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const appSidebar = document.getElementById('appSidebar');
    const sidebarBackdrop = document.getElementById('sidebarBackdrop');

    if (!mobileMenuBtn || !appSidebar || !sidebarBackdrop) return;

    function openMenu() {
        appSidebar.classList.add('open');
        sidebarBackdrop.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeMenu() {
        appSidebar.classList.remove('open');
        sidebarBackdrop.classList.remove('active');
        document.body.style.overflow = '';
    }

    mobileMenuBtn.addEventListener('click', () => {
        appSidebar.classList.contains('open') ? closeMenu() : openMenu();
    });

    sidebarBackdrop.addEventListener('click', closeMenu);
}

function initDateDisplay() {
    const dateElement = document.getElementById('currentDateDisplay');
    if (!dateElement) return;

    try {
        const today = new Date();
        const options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
        const formattedDate = today.toLocaleDateString('pt-BR', options);
        dateElement.textContent = formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1);
    } catch {
        dateElement.textContent = 'Hoje';
    }
}

async function carregarMetricasConsolidadas() {
    try {
        const response = await fetch('/api/dashboard');
        if (!response.ok) throw new Error('API indisponível');

        const data = await response.json();
        const kpis = data.kpis || {};

        // KPIs Globais
        document.getElementById('hubLucroTotal').textContent = formatarMoeda(kpis.lucroTotalAcumulado || 0);
        document.getElementById('hubQtdOperacoes').textContent = `${kpis.totalVendidos || 0} operação(ões) finalizada(s)`;

        document.getElementById('hubCapitalAlocado').textContent = formatarMoeda(kpis.capitalInvestidoParado || 0);
        document.getElementById('hubQtdAtivos').textContent = `${kpis.totalEstoque || 0} ativo(s) em andamento`;

        document.getElementById('hubRoiMedio').textContent = `${(kpis.roiMedio || 0).toFixed(1)}%`;

        // Card do Módulo Leilão
        document.getElementById('moduleLeilaoEstoque').textContent = `${kpis.totalEstoque || 0} carros`;
        document.getElementById('moduleLeilaoLucro').textContent = formatarMoeda(kpis.lucroTotalAcumulado || 0);
        document.getElementById('moduleLeilaoCapital').textContent = formatarMoeda(kpis.capitalInvestidoParado || 0);
        document.getElementById('moduleLeilaoRoi').textContent = `${(kpis.roiMedio || 0).toFixed(1)}%`;

        // Badge na Sidebar
        const badge = document.getElementById('badgeLeilaoCount');
        if (badge) {
            badge.textContent = kpis.totalGeral || 0;
        }

    } catch (err) {
        console.warn('[FinanceHub] Carregando dados locais de fallback...', err.message);
        
        const localData = localStorage.getItem('autoleilao_veiculos');
        let veiculos = [];
        if (localData) {
            try { veiculos = JSON.parse(localData); } catch {}
        }

        let lucroTotal = 0;
        let capitalAlocado = 0;
        let totalVendidos = 0;
        let totalEstoque = 0;
        let somaRoi = 0;

        veiculos.forEach(v => {
            if (v.status === 'Vendido') {
                totalVendidos++;
                if (v.lucroBruto) lucroTotal += Number(v.lucroBruto);
                if (v.roiPct) somaRoi += Number(v.roiPct);
            } else {
                totalEstoque++;
                capitalAlocado += Number(v.custoTotal || 0);
            }
        });

        const roiMedio = totalVendidos > 0 ? (somaRoi / totalVendidos) : 0;

        document.getElementById('hubLucroTotal').textContent = formatarMoeda(lucroTotal);
        document.getElementById('hubQtdOperacoes').textContent = `${totalVendidos} operação(ões) finalizada(s)`;
        document.getElementById('hubCapitalAlocado').textContent = formatarMoeda(capitalAlocado);
        document.getElementById('hubQtdAtivos').textContent = `${totalEstoque} ativo(s) em andamento`;
        document.getElementById('hubRoiMedio').textContent = `${roiMedio.toFixed(1)}%`;

        document.getElementById('moduleLeilaoEstoque').textContent = `${totalEstoque} carros`;
        document.getElementById('moduleLeilaoLucro').textContent = formatarMoeda(lucroTotal);
        document.getElementById('moduleLeilaoCapital').textContent = formatarMoeda(capitalAlocado);
        document.getElementById('moduleLeilaoRoi').textContent = `${roiMedio.toFixed(1)}%`;

        const badge = document.getElementById('badgeLeilaoCount');
        if (badge) badge.textContent = veiculos.length;
    }
}

function formatarMoeda(valor) {
    const num = Number(valor) || 0;
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
