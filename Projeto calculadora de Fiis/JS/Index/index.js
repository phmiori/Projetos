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
    carregarBadgeFii();
    carregarModuloCasas();
    carregarModuloCripto();
});

async function carregarBadgeCofrinho() {
    const badge = document.getElementById('badgeCofrinhoCountIndex');

    try {
        const response = await fetch('/api/cofrinhos');
        if (!response.ok) throw new Error('API indisponível');
        const cofrinhos = await response.json();

        if (badge) badge.textContent = cofrinhos.length;

        let totalInvestido = 0;
        let totalRendaDia = 0;
        let totalRendimentoBruto = 0;

        cofrinhos.forEach(item => {
            const valorInvestido = Number(item.valorInvestido) || 0;
            const rendaPorDia = Number(item.rendaPorDia) || 0;
            const taxaDiaria = valorInvestido > 0 ? rendaPorDia / valorInvestido : 0;

            const diasCorridos = calcularDiasCorridosCofrinho(item.dataInicio);
            const diasUteis = contarDiasUteisCofrinho(item.dataInicio, diasCorridos);
            const saldoBruto = valorInvestido * Math.pow(1 + taxaDiaria, diasUteis);

            totalInvestido += valorInvestido;
            totalRendaDia += saldoBruto * taxaDiaria;
            totalRendimentoBruto += saldoBruto - valorInvestido;
        });

        const moduleCofrinhoCount = document.getElementById('moduleCofrinhoCount');
        const moduleCofrinhoInvestido = document.getElementById('moduleCofrinhoInvestido');
        const moduleCofrinhoRendaDia = document.getElementById('moduleCofrinhoRendaDia');
        const moduleCofrinhoRendimento = document.getElementById('moduleCofrinhoRendimento');

        if (moduleCofrinhoCount) moduleCofrinhoCount.textContent = `${cofrinhos.length} cofrinhos`;
        if (moduleCofrinhoInvestido) moduleCofrinhoInvestido.textContent = formatarMoeda(totalInvestido);
        if (moduleCofrinhoRendaDia) moduleCofrinhoRendaDia.textContent = formatarMoeda(totalRendaDia);
        if (moduleCofrinhoRendimento) moduleCofrinhoRendimento.textContent = formatarMoeda(totalRendimentoBruto);
    } catch (err) {
        console.warn('[FinanceHub] Não foi possível carregar o total de cofrinhos.', err.message);
    }
}

/**
 * Cálculo de dias corridos/úteis do Cofrinho (espelha JS/Cofrinho/cofrinho.js) para estimar
 * o rendimento bruto acumulado no card-resumo da Visão Geral.
 */
const cacheFeriadosCofrinhoIndex = {};

function calcularPascoaCofrinho(ano) {
    const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100;
    const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const mes = Math.floor((h + l - 7 * m + 114) / 31);
    const dia = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(ano, mes - 1, dia);
}

function formatarDataChaveCofrinho(data) {
    return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
}

function obterFeriadosNacionaisCofrinho(ano) {
    if (cacheFeriadosCofrinhoIndex[ano]) return cacheFeriadosCofrinhoIndex[ano];
    const feriados = new Set();
    const somarDias = (data, dias) => { const n = new Date(data); n.setDate(n.getDate() + dias); return n; };
    const add = (data) => feriados.add(formatarDataChaveCofrinho(data));

    add(new Date(ano, 0, 1));
    add(new Date(ano, 3, 21));
    add(new Date(ano, 4, 1));
    add(new Date(ano, 8, 7));
    add(new Date(ano, 9, 12));
    add(new Date(ano, 10, 2));
    add(new Date(ano, 10, 15));
    add(new Date(ano, 10, 20));
    add(new Date(ano, 11, 25));

    const pascoa = calcularPascoaCofrinho(ano);
    add(somarDias(pascoa, -48));
    add(somarDias(pascoa, -47));
    add(somarDias(pascoa, -2));
    add(somarDias(pascoa, 60));

    cacheFeriadosCofrinhoIndex[ano] = feriados;
    return feriados;
}

function ehDiaUtilCofrinho(data) {
    const diaSemana = data.getDay();
    if (diaSemana === 0 || diaSemana === 6) return false;
    return !obterFeriadosNacionaisCofrinho(data.getFullYear()).has(formatarDataChaveCofrinho(data));
}

function parseDataLocalCofrinho(valor) {
    const match = String(valor).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
        const [, ano, mes, dia] = match;
        return new Date(Number(ano), Number(mes) - 1, Number(dia));
    }
    return new Date(valor);
}

function calcularDiasCorridosCofrinho(dataInicio) {
    const inicio = parseDataLocalCofrinho(dataInicio);
    inicio.setHours(0, 0, 0, 0);
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    return Math.max(1, Math.floor((hoje - inicio) / (1000 * 60 * 60 * 24)) + 1);
}

function contarDiasUteisCofrinho(dataInicio, diasCorridos) {
    const inicio = parseDataLocalCofrinho(dataInicio);
    inicio.setHours(0, 0, 0, 0);
    let uteis = 0;
    for (let i = 0; i < diasCorridos; i++) {
        const data = new Date(inicio);
        data.setDate(data.getDate() + i);
        if (ehDiaUtilCofrinho(data)) uteis++;
    }
    return uteis;
}

async function carregarBadgeFii() {
    const badge = document.getElementById('badgeFiiCountIndex');

    try {
        const response = await fetch('/api/fii', { cache: 'no-store' });
        if (!response.ok) throw new Error('API indisponível');
        const fundos = await response.json();

        if (badge) badge.textContent = fundos.length;

        let totalInvestido = 0;
        let totalMercado = 0;
        let rendaMensalTotal = 0;

        fundos.forEach(item => {
            const cotas = item.cotas || 0;
            const precoRef = item.precoAtual != null ? item.precoAtual : item.precoMedio;
            totalInvestido += cotas * (item.precoMedio || 0);
            totalMercado += cotas * (precoRef || 0);
            rendaMensalTotal += cotas * (item.ultimoDividendo || 0);
        });

        const yieldMedio = totalInvestido > 0 ? (rendaMensalTotal / totalInvestido) * 100 : 0;

        const moduleFiiCount = document.getElementById('moduleFiiCount');
        const moduleFiiRenda = document.getElementById('moduleFiiRenda');
        const moduleFiiPatrimonio = document.getElementById('moduleFiiPatrimonio');
        const moduleFiiYield = document.getElementById('moduleFiiYield');

        if (moduleFiiCount) moduleFiiCount.textContent = `${fundos.length} FIIs`;
        if (moduleFiiRenda) moduleFiiRenda.textContent = formatarMoeda(rendaMensalTotal);
        if (moduleFiiPatrimonio) moduleFiiPatrimonio.textContent = formatarMoeda(totalMercado);
        if (moduleFiiYield) moduleFiiYield.textContent = `${yieldMedio.toFixed(2)}% a.m.`;
    } catch (err) {
        console.warn('[FinanceHub] Não foi possível carregar o total de fundos imobiliários.', err.message);
        if (badge) badge.textContent = '0';
    }
}

async function carregarModuloCasas() {
    const badge = document.getElementById('badgeCasasCountIndex');

    try {
        const response = await fetch('/api/imoveis');
        if (!response.ok) throw new Error('API indisponível');
        const imoveis = await response.json();

        if (badge) badge.textContent = imoveis.length;

        let lucroTotal = 0;
        let capitalAlocado = 0;
        let totalEstoque = 0;
        let totalVendidos = 0;
        let somaRoi = 0;

        imoveis.forEach(im => {
            if (im.status === 'Vendido') {
                totalVendidos++;
                if (im.lucroBruto !== null && im.lucroBruto !== undefined) lucroTotal += Number(im.lucroBruto);
                if (im.roiPct !== null && im.roiPct !== undefined) somaRoi += Number(im.roiPct);
            } else {
                totalEstoque++;
                capitalAlocado += Number(im.custoTotal || 0);
            }
        });

        const roiMedio = totalVendidos > 0 ? (somaRoi / totalVendidos) : 0;

        const moduleCasasEstoque = document.getElementById('moduleCasasEstoque');
        const moduleCasasLucro = document.getElementById('moduleCasasLucro');
        const moduleCasasCapital = document.getElementById('moduleCasasCapital');
        const moduleCasasRoi = document.getElementById('moduleCasasRoi');

        if (moduleCasasEstoque) moduleCasasEstoque.textContent = `${totalEstoque} imóveis`;
        if (moduleCasasLucro) moduleCasasLucro.textContent = formatarMoeda(lucroTotal);
        if (moduleCasasCapital) moduleCasasCapital.textContent = formatarMoeda(capitalAlocado);
        if (moduleCasasRoi) moduleCasasRoi.textContent = `${roiMedio.toFixed(1)}%`;
    } catch (err) {
        console.warn('[FinanceHub] Não foi possível carregar o total de casas de leilão.', err.message);
    }
}

async function carregarModuloCripto() {
    const badge = document.getElementById('badgeCriptoCountIndex');

    try {
        const response = await fetch('/api/cripto');
        if (!response.ok) throw new Error('API indisponível');
        const moedas = await response.json();

        if (badge) badge.textContent = moedas.length;

        let totalInvestido = 0;
        let totalMercado = 0;

        moedas.forEach(m => {
            const precoRef = m.precoAtual != null ? m.precoAtual : m.precoMedio;
            totalInvestido += (m.quantidade || 0) * (m.precoMedio || 0);
            totalMercado += (m.quantidade || 0) * (precoRef || 0);
        });

        const valorizacaoPct = totalInvestido > 0 ? ((totalMercado - totalInvestido) / totalInvestido) * 100 : 0;

        const moduleCriptoCount = document.getElementById('moduleCriptoCount');
        const moduleCriptoPatrimonio = document.getElementById('moduleCriptoPatrimonio');
        const moduleCriptoCusto = document.getElementById('moduleCriptoCusto');
        const moduleCriptoValorizacao = document.getElementById('moduleCriptoValorizacao');

        if (moduleCriptoCount) moduleCriptoCount.textContent = `${moedas.length} moedas`;
        if (moduleCriptoPatrimonio) moduleCriptoPatrimonio.textContent = formatarMoeda(totalMercado);
        if (moduleCriptoCusto) moduleCriptoCusto.textContent = formatarMoeda(totalInvestido);
        if (moduleCriptoValorizacao) {
            const sinal = valorizacaoPct >= 0 ? '+' : '';
            moduleCriptoValorizacao.textContent = `${sinal}${valorizacaoPct.toFixed(2)}%`;
            moduleCriptoValorizacao.className = `mini-stat-val ${valorizacaoPct >= 0 ? 'text-income' : 'text-expense'}`;
        }
    } catch (err) {
        console.warn('[FinanceHub] Não foi possível carregar o total de criptomoedas.', err.message);
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
