/**
 * JS/Cripto/cripto.js
 * Lógica do Módulo de Gestão de Criptomoedas (Cripto Hub)
 * Inclui: Carteira de Criptoativos, Simulador de Aportes (DCA), Gráficos Chart.js, Radar de Criptomoedas e Exportação CSV.
 */

// =========================================================
// 1. ESTADO GLOBAL & DADOS
// =========================================================

const API_BASE = '/api';

const stateCripto = {
    investimentos: [],
    tema: localStorage.getItem('financehub_theme') || 'dark',
    subAbaAtiva: 'cryptoSubPortfolio',
    radarFiltro: 'all',
    radarBusca: '',
    simulacaoDados: []
};

// Dados pré-configurados do Radar de Criptomoedas
const RADAR_CRIPTO = [
    {
        ticker: 'BTC',
        moedaId: 'bitcoin',
        name: 'Bitcoin',
        segment: 'Layer 1',
        description: 'A primeira e maior criptomoeda por valor de mercado, referência de reserva de valor digital.',
        precoBase: 350000.00,
        url: 'https://www.coingecko.com/pt/moedas/bitcoin'
    },
    {
        ticker: 'ETH',
        moedaId: 'ethereum',
        name: 'Ethereum',
        segment: 'Layer 1',
        description: 'Maior plataforma de contratos inteligentes, base de grande parte do ecossistema DeFi e NFTs.',
        precoBase: 14500.00,
        url: 'https://www.coingecko.com/pt/moedas/ethereum'
    },
    {
        ticker: 'SOL',
        moedaId: 'solana',
        name: 'Solana',
        segment: 'Layer 1',
        description: 'Blockchain de alta performance conhecida pela velocidade e taxas baixas de transação.',
        precoBase: 950.00,
        url: 'https://www.coingecko.com/pt/moedas/solana'
    },
    {
        ticker: 'MATIC',
        moedaId: 'matic-network',
        name: 'Polygon',
        segment: 'Layer 2',
        description: 'Solução de escalabilidade em camada 2 para a rede Ethereum, com taxas reduzidas.',
        precoBase: 3.20,
        url: 'https://www.coingecko.com/pt/moedas/polygon'
    },
    {
        ticker: 'LINK',
        moedaId: 'chainlink',
        name: 'Chainlink',
        segment: 'DeFi',
        description: 'Rede de oráculos descentralizados que conecta contratos inteligentes a dados do mundo real.',
        precoBase: 85.00,
        url: 'https://www.coingecko.com/pt/moedas/chainlink'
    },
    {
        ticker: 'DOGE',
        moedaId: 'dogecoin',
        name: 'Dogecoin',
        segment: 'Meme',
        description: 'A meme coin mais popular do mercado, criada como piada e adotada como ativo especulativo.',
        precoBase: 1.05,
        url: 'https://www.coingecko.com/pt/moedas/dogecoin'
    },
    {
        ticker: 'USDT',
        moedaId: 'tether',
        name: 'Tether',
        segment: 'Stablecoin',
        description: 'Stablecoin atrelada ao dólar americano, usada para reserva de caixa e proteção contra volatilidade.',
        precoBase: 5.40,
        url: 'https://www.coingecko.com/pt/moedas/tether'
    }
];

// Instâncias de gráficos Chart.js
let chartEvolucao = null;
let chartMoedas = null;
let chartLucro = null;

// =========================================================
// 2. INICIALIZAÇÃO
// =========================================================

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initMobileNav();
    initSubNavigation();
    initEventListeners();
    carregarCarteira();
    renderizarRadar();

    // Iniciar simulação padrão da calculadora
    executarSimulacao();
});

// =========================================================
// 1.1 MAPEAMENTO API <-> ESTADO INTERNO
// =========================================================

function mapCriptoFromApi(r) {
    return {
        id: r.id,
        moedaId: r.moedaId,
        ticker: r.ticker,
        nome: r.nome,
        segment: r.categoria,
        shares: r.quantidade,
        avgPrice: r.precoMedio,
        notes: r.observacoes || '',
        currentPrice: r.precoAtual,
        priceUpdatedAt: r.precoAtualizadoEm
    };
}

function mapCriptoToApi(item) {
    return {
        moedaId: item.moedaId,
        ticker: item.ticker,
        nome: item.nome,
        categoria: item.segment,
        quantidade: item.shares,
        precoMedio: item.avgPrice,
        observacoes: item.notes
    };
}

/**
 * Carrega a carteira de criptomoedas do usuário logado a partir da API
 */
async function carregarCarteira() {
    try {
        const response = await fetch(`${API_BASE}/cripto`);
        if (!response.ok) throw new Error('API indisponível');

        const dados = await response.json();
        stateCripto.investimentos = dados.map(mapCriptoFromApi);
    } catch (err) {
        console.error('[Cripto Hub] Erro ao carregar carteira:', err.message);
        stateCripto.investimentos = [];
    }

    renderizarCarteira();
    atualizarLabelUltimaAtualizacao();
}

/**
 * Busca as cotações de mercado atuais de todas as criptomoedas da carteira (CoinGecko via backend)
 */
async function atualizarCotacoes() {
    const btn = document.getElementById('btnAtualizarCotacoes');
    const btnLabel = btn ? btn.querySelector('span') : null;

    if (btn) btn.disabled = true;
    if (btnLabel) btnLabel.textContent = 'Atualizando...';

    try {
        const response = await fetch(`${API_BASE}/cripto/atualizar-precos`, { method: 'POST' });
        if (!response.ok) throw new Error('Falha ao atualizar cotações');

        const data = await response.json();
        stateCripto.investimentos = data.investimentos.map(mapCriptoFromApi);
        renderizarCarteira();
        atualizarLabelUltimaAtualizacao();

        const falhas = (data.resultados || []).filter(r => !r.sucesso);
        if (falhas.length > 0) {
            alert(`Não foi possível atualizar a cotação de: ${falhas.map(f => f.ticker).join(', ')}`);
        }
    } catch (err) {
        console.error('Erro ao atualizar cotações:', err);
        alert('Erro ao buscar cotações atualizadas. Tente novamente em instantes.');
    } finally {
        if (btn) btn.disabled = false;
        if (btnLabel) btnLabel.textContent = 'Atualizar Cotações';
    }
}

function atualizarLabelUltimaAtualizacao() {
    const label = document.getElementById('criptoUltimaAtualizacao');
    const kpiLabel = document.getElementById('kpiUltimaAtualizacao');

    const comData = stateCripto.investimentos.filter(i => i.priceUpdatedAt);
    if (comData.length === 0) {
        if (label) label.textContent = 'Cotações não atualizadas ainda';
        if (kpiLabel) kpiLabel.textContent = 'Não atualizado';
        return;
    }

    const maisRecente = comData.reduce((max, i) => new Date(i.priceUpdatedAt) > new Date(max.priceUpdatedAt) ? i : max);
    const data = new Date(maisRecente.priceUpdatedAt);
    const texto = `${data.toLocaleDateString('pt-BR')} às ${data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    if (label) label.textContent = `Cotações atualizadas em ${texto}`;
    if (kpiLabel) kpiLabel.textContent = texto;
}

// =========================================================
// 3. TEMA E NAVEGAÇÃO
// =========================================================

function initTheme() {
    const root = document.documentElement;
    const themeToggleBtn = document.getElementById('themeToggleBtn');

    applyTheme(stateCripto.tema);

    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            stateCripto.tema = stateCripto.tema === 'dark' ? 'light' : 'dark';
            applyTheme(stateCripto.tema);
            localStorage.setItem('financehub_theme', stateCripto.tema);

            // Recriar gráficos com as cores ajustadas
            atualizarCoresGraficos();
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

function initSubNavigation() {
    const subNavBtns = document.querySelectorAll('.sub-nav-btn');
    subNavBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            subNavBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const targetId = btn.getAttribute('data-subtarget');
            stateCripto.subAbaAtiva = targetId;

            document.querySelectorAll('.fii-subview').forEach(view => {
                view.classList.remove('active');
            });

            const targetView = document.getElementById(targetId);
            if (targetView) {
                targetView.classList.add('active');
            }

            if (targetId === 'cryptoSubPortfolio') {
                renderizarCarteira();
            } else if (targetId === 'cryptoSubCalculator') {
                executarSimulacao();
            } else if (targetId === 'cryptoSubRadar') {
                renderizarRadar();
            }
        });
    });
}

function initEventListeners() {
    // Botões de Abertura de Modais
    const btnAdicionarCripto = document.getElementById('btnAdicionarCripto');
    if (btnAdicionarCripto) btnAdicionarCripto.addEventListener('click', () => abrirModalCripto());

    // Fechamento de Modais
    const modalCriptoClose = document.getElementById('modalCriptoClose');
    const btnCriptoCancel = document.getElementById('btnCriptoCancel');
    const modalCriptoOverlay = document.getElementById('modalCriptoOverlay');

    if (modalCriptoClose) modalCriptoClose.addEventListener('click', fecharModalCripto);
    if (btnCriptoCancel) btnCriptoCancel.addEventListener('click', fecharModalCripto);
    if (modalCriptoOverlay) {
        modalCriptoOverlay.addEventListener('click', (e) => {
            if (e.target === modalCriptoOverlay) fecharModalCripto();
        });
    }

    // Modal de Aporte / Compra
    const modalAporteClose = document.getElementById('modalAporteClose');
    const btnAporteCancel = document.getElementById('btnAporteCancel');
    const modalAporteOverlay = document.getElementById('modalAporteOverlay');

    if (modalAporteClose) modalAporteClose.addEventListener('click', fecharModalAporte);
    if (btnAporteCancel) btnAporteCancel.addEventListener('click', fecharModalAporte);
    if (modalAporteOverlay) {
        modalAporteOverlay.addEventListener('click', (e) => {
            if (e.target === modalAporteOverlay) fecharModalAporte();
        });
    }

    // Formulários
    const criptoForm = document.getElementById('criptoForm');
    if (criptoForm) criptoForm.addEventListener('submit', salvarCripto);

    const aporteForm = document.getElementById('aporteForm');
    if (aporteForm) aporteForm.addEventListener('submit', salvarAporte);

    // Formulário da Calculadora
    const calcForm = document.getElementById('calcForm');
    if (calcForm) {
        calcForm.addEventListener('submit', (e) => {
            e.preventDefault();
            executarSimulacao();
        });
    }

    // Inputs automáticos da Calculadora
    const calcInputs = document.querySelectorAll('.calc-auto-trigger');
    calcInputs.forEach(input => {
        input.addEventListener('input', () => {
            executarSimulacao();
        });
    });

    // Atualização de Cotações de Mercado
    const btnAtualizarCotacoes = document.getElementById('btnAtualizarCotacoes');
    if (btnAtualizarCotacoes) btnAtualizarCotacoes.addEventListener('click', atualizarCotacoes);

    // Exportação CSV
    const btnExportPortfolioCsv = document.getElementById('btnExportPortfolioCsv');
    if (btnExportPortfolioCsv) {
        btnExportPortfolioCsv.addEventListener('click', exportarCarteiraCSV);
    }

    const btnExportSimulationCsv = document.getElementById('btnExportSimulationCsv');
    if (btnExportSimulationCsv) {
        btnExportSimulationCsv.addEventListener('click', exportarSimulacaoCSV);
    }

    // Radar Filtros
    const radarPills = document.querySelectorAll('.radar-pill');
    radarPills.forEach(pill => {
        pill.addEventListener('click', () => {
            radarPills.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            stateCripto.radarFiltro = pill.getAttribute('data-segment');
            renderizarRadar();
        });
    });

    const radarSearchInput = document.getElementById('radarSearchInput');
    if (radarSearchInput) {
        radarSearchInput.addEventListener('input', (e) => {
            stateCripto.radarBusca = e.target.value.toLowerCase().trim();
            renderizarRadar();
        });
    }

    // Gatilhos no Modal de Aporte
    const aporteQtd = document.getElementById('aporteQtd');
    const aportePreco = document.getElementById('aportePreco');

    [aporteQtd, aportePreco].forEach(elem => {
        if (elem) elem.addEventListener('input', recalcularPrevisaoAporte);
    });
}

// =========================================================
// 4. CARTEIRA DE CRIPTOMOEDAS (TABELA, KPIS & GRÁFICOS)
// =========================================================

function renderizarCarteira() {
    const list = stateCripto.investimentos;

    let totalInvestido = 0;
    let totalMercado = 0;

    const moedaMap = {};
    const lucroList = [];

    list.forEach(item => {
        const investido = (item.shares || 0) * (item.avgPrice || 0);
        const precoRef = item.currentPrice != null ? item.currentPrice : item.avgPrice;
        const valorAtual = (item.shares || 0) * (precoRef || 0);

        totalInvestido += investido;
        totalMercado += valorAtual;

        moedaMap[item.ticker] = (moedaMap[item.ticker] || 0) + valorAtual;

        lucroList.push({
            ticker: item.ticker,
            lucro: valorAtual - investido
        });
    });

    const valorizacao = totalMercado - totalInvestido;
    const valorizacaoPct = totalInvestido > 0 ? (valorizacao / totalInvestido) * 100 : 0;

    // Atualizar KPIs
    document.getElementById('kpiPatrimonioTotal').textContent = formatarMoeda(totalMercado);
    document.getElementById('kpiPatrimonioSub').textContent = `Custo de aquisição: ${formatarMoeda(totalInvestido)}`;
    document.getElementById('kpiTotalAtivos').textContent = list.length.toLocaleString('pt-BR');

    const kpiValorizacao = document.getElementById('kpiValorizacao');
    const kpiValorizacaoPct = document.getElementById('kpiValorizacaoPct');
    if (kpiValorizacao && kpiValorizacaoPct) {
        const sinal = valorizacao >= 0 ? '+' : '';
        const corClasse = valorizacao >= 0 ? 'income' : 'expense';
        kpiValorizacao.textContent = `${sinal}${formatarMoeda(valorizacao)}`;
        kpiValorizacao.className = `kpi-value text-${corClasse}`;
        kpiValorizacaoPct.textContent = `${sinal}${valorizacaoPct.toFixed(2)}% vs. preço médio`;
        kpiValorizacaoPct.className = `kpi-status-tag tag-${corClasse}`;
    }

    // Badge na Sidebar
    const badgeCriptoCount = document.getElementById('badgeCriptoCount');
    if (badgeCriptoCount) badgeCriptoCount.textContent = list.length;

    // Renderizar Linhas da Tabela
    const tbody = document.getElementById('criptoTableBody');
    if (!tbody) return;

    if (list.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" style="text-align: center; padding: 32px; color: var(--text-sub);">
                    Nenhuma criptomoeda cadastrada ainda. Clique em "<strong>+ Adicionar Moeda</strong>" acima para iniciar sua carteira!
                </td>
            </tr>
        `;
    } else {
        tbody.innerHTML = list.map(item => {
            const investido = item.shares * item.avgPrice;
            const temCotacao = item.currentPrice != null;
            const precoRef = temCotacao ? item.currentPrice : item.avgPrice;
            const valorAtual = item.shares * precoRef;
            const valorizacaoItemPct = temCotacao && item.avgPrice > 0
                ? ((item.currentPrice - item.avgPrice) / item.avgPrice) * 100
                : null;

            return `
                <tr>
                    <td>
                        <span class="ticker-badge-cell">${escapeHTML(item.ticker)}</span>
                        <div style="font-size: 0.75rem; color: var(--text-sub); margin-top: 2px;">${escapeHTML(item.nome)}</div>
                    </td>
                    <td><span class="segment-tag-cell">${escapeHTML(item.segment)}</span></td>
                    <td><strong>${formatarQuantidade(item.shares)}</strong></td>
                    <td>${formatarMoeda(item.avgPrice)}</td>
                    <td>${temCotacao ? formatarMoeda(item.currentPrice) : '<span style="color: var(--text-sub);">—</span>'}</td>
                    <td>${valorizacaoItemPct !== null
                        ? `<strong style="color: var(--color-${valorizacaoItemPct >= 0 ? 'income' : 'expense'});">${valorizacaoItemPct >= 0 ? '+' : ''}${valorizacaoItemPct.toFixed(2)}%</strong>`
                        : '<span style="color: var(--text-sub);">—</span>'}</td>
                    <td><strong style="color: var(--text-main);">${formatarMoeda(investido)}</strong></td>
                    <td><strong style="color: var(--accent-color);">${formatarMoeda(valorAtual)}</strong></td>
                    <td>
                        <div class="table-action-btns">
                            <button class="btn-fii-action" onclick="abrirModalAporte('${item.id}')" title="Comprar mais">
                                ➕ Aportar
                            </button>
                            <button class="btn-fii-action" onclick="simularCriptoNaCalculadora('${item.id}')" title="Simular na Calculadora">
                                ⚡ Simular
                            </button>
                            <button class="btn-fii-action" onclick="abrirModalCripto('${item.id}')" title="Editar Moeda">
                                ✏️
                            </button>
                            <button class="btn-fii-action delete" onclick="excluirCripto('${item.id}')" title="Excluir da Carteira">
                                🗑️
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // Gráficos
    renderizarGraficosCarteira(moedaMap, lucroList);
}

function renderizarGraficosCarteira(moedaMap, lucroList) {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#FFFFFF' : '#1C1C1E';
    const borderColor = isDark ? '#2C2C2E' : '#E5E5EA';

    // 1. Gráfico de Distribuição por Moeda (Doughnut)
    const ctxMoedas = document.getElementById('chartMoedas');
    if (ctxMoedas) {
        if (chartMoedas) chartMoedas.destroy();

        const labels = Object.keys(moedaMap);
        const data = Object.values(moedaMap);

        chartMoedas = new Chart(ctxMoedas, {
            type: 'doughnut',
            data: {
                labels: labels.length > 0 ? labels : ['Sem dados'],
                datasets: [{
                    data: data.length > 0 ? data : [1],
                    backgroundColor: [
                        '#EEBB00',
                        '#2E7D32',
                        '#3B82F6',
                        '#8B5CF6',
                        '#EC4899',
                        '#F97316',
                        '#6B7280'
                    ],
                    borderColor: isDark ? '#1C1C1E' : '#FFFFFF',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: { color: textColor, font: { weight: '600', size: 11 } }
                    },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => ` ${ctx.label}: ${formatarMoeda(ctx.raw)}`
                        }
                    }
                }
            }
        });
    }

    // 2. Gráfico de Lucro/Prejuízo por Moeda (Bar)
    const ctxLucro = document.getElementById('chartLucro');
    if (ctxLucro) {
        if (chartLucro) chartLucro.destroy();

        const labels = lucroList.map(i => i.ticker);
        const data = lucroList.map(i => i.lucro);

        chartLucro = new Chart(ctxLucro, {
            type: 'bar',
            data: {
                labels: labels.length > 0 ? labels : ['Nenhum'],
                datasets: [{
                    label: 'Lucro / Prejuízo R$',
                    data: data.length > 0 ? data : [0],
                    backgroundColor: data.map(v => v >= 0 ? '#2E7D32' : '#D32F2F'),
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => ` ${formatarMoeda(ctx.raw)}`
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { color: textColor }
                    },
                    y: {
                        grid: { color: borderColor },
                        ticks: {
                            color: textColor,
                            callback: (v) => formatarMoeda(v)
                        }
                    }
                }
            }
        });
    }
}

// =========================================================
// 5. SIMULADOR DE APORTES (DCA)
// =========================================================

function executarSimulacao() {
    const precoAtual = parseFloat(document.getElementById('calcPrecoAtual')?.value) || 0;
    const valorizacaoMensalPct = parseFloat(document.getElementById('calcValorizacaoMensal')?.value) || 0;
    const monthlyInvestment = parseFloat(document.getElementById('calcAporteMensal')?.value) || 0;
    const durationInput = parseInt(document.getElementById('calcPrazo')?.value, 10) || 0;
    const durationUnit = document.getElementById('calcUnidadePrazo')?.value || 'years';
    const initialQuantity = parseFloat(document.getElementById('calcQuantidadeInicial')?.value) || 0;

    const totalMonths = durationUnit === 'years' ? durationInput * 12 : durationInput;

    let currentQuantity = initialQuantity;
    let currentPrice = precoAtual;
    let accumulatedInvested = 0.0;

    stateCripto.simulacaoDados = [];

    const initialEquity = initialQuantity * precoAtual;

    if (precoAtual > 0) {
        for (let month = 1; month <= totalMonths; month++) {
            currentPrice = currentPrice * (1 + valorizacaoMensalPct / 100);
            accumulatedInvested += monthlyInvestment;

            const newQuantity = currentPrice > 0 ? monthlyInvestment / currentPrice : 0;
            currentQuantity += newQuantity;

            const equity = currentQuantity * currentPrice;

            stateCripto.simulacaoDados.push({
                month,
                price: currentPrice,
                investedThisMonth: monthlyInvestment,
                quantity: currentQuantity,
                equity
            });
        }
    }

    const finalEquity = currentQuantity * currentPrice;
    const totalAportadoComInicial = accumulatedInvested + initialEquity;
    const ganhoTotal = finalEquity - totalAportadoComInicial;

    // Atualizar UI de Resultados
    document.getElementById('calcResPatrimonioInicial').textContent = formatarMoeda(initialEquity);
    document.getElementById('calcResPatrimonioFinal').textContent = formatarMoeda(finalEquity);

    const durationLabel = durationInput === 1
        ? (durationUnit === 'years' ? '1 Ano' : '1 Mês')
        : `${durationInput} ${durationUnit === 'years' ? 'Anos' : 'Meses'}`;

    document.getElementById('calcResPrazo').textContent = durationLabel;
    document.getElementById('calcResTotalAportado').textContent = formatarMoeda(accumulatedInvested);
    document.getElementById('calcResQuantidadeFinal').textContent = formatarQuantidade(currentQuantity);

    const ganhoEl = document.getElementById('calcResGanhoTotal');
    ganhoEl.textContent = formatarMoeda(ganhoTotal);
    ganhoEl.className = `mini-highlight-val ${ganhoTotal >= 0 ? 'text-income' : 'text-expense'}`;

    renderizarTabelaSimulacao();
    renderizarGraficoEvolucao();
}

function renderizarTabelaSimulacao() {
    const tbody = document.getElementById('simulacaoTableBody');
    if (!tbody) return;

    tbody.innerHTML = stateCripto.simulacaoDados.map(row => `
        <tr>
            <td><strong>${row.month}º mês</strong></td>
            <td>${formatarMoeda(row.price)}</td>
            <td>${formatarMoeda(row.investedThisMonth)}</td>
            <td>${formatarQuantidade(row.quantity)}</td>
            <td><strong style="color: var(--accent-color);">${formatarMoeda(row.equity)}</strong></td>
        </tr>
    `).join('');
}

function renderizarGraficoEvolucao() {
    const ctx = document.getElementById('chartEvolucao');
    if (!ctx) return;

    if (chartEvolucao) chartEvolucao.destroy();

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#FFFFFF' : '#1C1C1E';
    const borderColor = isDark ? '#2C2C2E' : '#E5E5EA';

    const labels = stateCripto.simulacaoDados.map(r => `${r.month}º Mês`);
    const dataPatrimonio = stateCripto.simulacaoDados.map(r => r.equity);

    let acumulado = 0;
    const dataAportado = stateCripto.simulacaoDados.map(r => {
        acumulado += r.investedThisMonth;
        return acumulado;
    });

    chartEvolucao = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Patrimônio Total Acumulado',
                    data: dataPatrimonio,
                    borderColor: '#EEBB00',
                    backgroundColor: 'rgba(238, 187, 0, 0.1)',
                    fill: true,
                    borderWidth: 3,
                    tension: 0.35,
                    pointRadius: 0,
                    pointHoverRadius: 6
                },
                {
                    label: 'Total Aportado do Bolso',
                    data: dataAportado,
                    borderColor: isDark ? '#A0A0A0' : '#6C6C70',
                    borderDash: [5, 5],
                    borderWidth: 2,
                    fill: false,
                    tension: 0.1,
                    pointRadius: 0,
                    pointHoverRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    labels: { color: textColor, font: { weight: '700' } }
                },
                tooltip: {
                    callbacks: {
                        label: (ctx) => ` ${ctx.dataset.label}: ${formatarMoeda(ctx.raw)}`
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255,255,255,0.03)' },
                    ticks: { color: textColor, maxTicksLimit: 12 }
                },
                y: {
                    grid: { color: borderColor },
                    ticks: {
                        color: textColor,
                        callback: (v) => formatarMoeda(v)
                    }
                }
            }
        }
    });
}

function atualizarCoresGraficos() {
    const moedaMap = stateCripto.investimentos.reduce((acc, curr) => {
        const precoRef = curr.currentPrice != null ? curr.currentPrice : curr.avgPrice;
        acc[curr.ticker] = (acc[curr.ticker] || 0) + (curr.shares * precoRef);
        return acc;
    }, {});
    const lucroList = stateCripto.investimentos.map(i => {
        const precoRef = i.currentPrice != null ? i.currentPrice : i.avgPrice;
        return { ticker: i.ticker, lucro: (i.shares * precoRef) - (i.shares * i.avgPrice) };
    });

    renderizarGraficosCarteira(moedaMap, lucroList);
    renderizarGraficoEvolucao();
}

// =========================================================
// 6. RADAR DE CRIPTOMOEDAS
// =========================================================

function renderizarRadar() {
    const container = document.getElementById('radarGrid');
    if (!container) return;

    let lista = RADAR_CRIPTO;

    if (stateCripto.radarFiltro !== 'all') {
        lista = lista.filter(c => c.segment.toLowerCase() === stateCripto.radarFiltro.toLowerCase());
    }

    if (stateCripto.radarBusca) {
        lista = lista.filter(c =>
            c.ticker.toLowerCase().includes(stateCripto.radarBusca) ||
            c.name.toLowerCase().includes(stateCripto.radarBusca) ||
            c.description.toLowerCase().includes(stateCripto.radarBusca)
        );
    }

    if (lista.length === 0) {
        container.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--text-sub);">
                Nenhuma moeda encontrada no Radar para os filtros aplicados.
            </div>
        `;
        return;
    }

    container.innerHTML = lista.map(cripto => `
        <article class="radar-fii-card">
            <div>
                <div class="radar-card-header">
                    <div>
                        <h3 class="radar-ticker-title">${cripto.ticker}</h3>
                        <p class="radar-fii-name">${cripto.name}</p>
                    </div>
                    <span class="segment-tag-cell">${cripto.segment}</span>
                </div>
                <p class="radar-fii-desc" style="margin-top: 14px;">${cripto.description}</p>
            </div>

            <footer class="radar-card-footer">
                <a href="${cripto.url}" target="_blank" rel="noopener noreferrer" class="btn-radar-link">
                    <span>CoinGecko</span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                        <polyline points="15 3 21 3 21 9"></polyline>
                        <line x1="10" y1="14" x2="21" y2="3"></line>
                    </svg>
                </a>
                <button class="btn-add-from-radar" onclick="adicionarCriptoDoRadar('${cripto.ticker}', '${cripto.moedaId}', '${cripto.name}', '${cripto.segment}', ${cripto.precoBase})">
                    + Adicionar à Carteira
                </button>
            </footer>
        </article>
    `).join('');
}

function adicionarCriptoDoRadar(ticker, moedaId, nome, segment, preco) {
    abrirModalCripto();
    document.getElementById('inputCriptoTicker').value = ticker;
    document.getElementById('inputCriptoMoedaId').value = moedaId;
    document.getElementById('inputCriptoNome').value = nome;
    document.getElementById('inputCriptoCategoria').value = segment;
    document.getElementById('inputCriptoAvgPrice').value = preco;
}

// =========================================================
// 7. MODAIS & AÇÕES DE CARTEIRA
// =========================================================

function abrirModalCripto(id = null) {
    const form = document.getElementById('criptoForm');
    form.reset();

    if (id) {
        const item = stateCripto.investimentos.find(i => String(i.id) === String(id));
        if (item) {
            document.getElementById('modalCriptoTitle').textContent = `Editar: ${item.ticker}`;
            document.getElementById('formCriptoId').value = item.id;
            document.getElementById('inputCriptoTicker').value = item.ticker;
            document.getElementById('inputCriptoNome').value = item.nome;
            document.getElementById('inputCriptoMoedaId').value = item.moedaId;
            document.getElementById('inputCriptoCategoria').value = item.segment;
            document.getElementById('inputCriptoQuantidade').value = item.shares;
            document.getElementById('inputCriptoAvgPrice').value = item.avgPrice;
            document.getElementById('inputCriptoNotes').value = item.notes || '';
        }
    } else {
        document.getElementById('modalCriptoTitle').textContent = 'Adicionar Moeda à Carteira';
        document.getElementById('formCriptoId').value = '';
        document.getElementById('inputCriptoCategoria').value = 'Layer 1';
    }

    document.getElementById('modalCriptoOverlay').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function fecharModalCripto() {
    document.getElementById('modalCriptoOverlay').classList.remove('active');
    document.body.style.overflow = '';
}

async function salvarCripto(e) {
    e.preventDefault();

    const id = document.getElementById('formCriptoId').value;
    const ticker = document.getElementById('inputCriptoTicker').value.trim().toUpperCase();
    const nome = document.getElementById('inputCriptoNome').value.trim();
    const moedaId = document.getElementById('inputCriptoMoedaId').value.trim().toLowerCase();
    const segment = document.getElementById('inputCriptoCategoria').value;
    const shares = parseFloat(document.getElementById('inputCriptoQuantidade').value) || 0;
    const avgPrice = parseFloat(document.getElementById('inputCriptoAvgPrice').value) || 0;
    const notes = document.getElementById('inputCriptoNotes').value.trim();

    if (!ticker || !moedaId || shares <= 0 || avgPrice <= 0) {
        alert('Preencha os campos obrigatórios corretamente.');
        return;
    }

    const payload = mapCriptoToApi({ ticker, nome, moedaId, segment, shares, avgPrice, notes });

    try {
        const url = id ? `${API_BASE}/cripto/${id}` : `${API_BASE}/cripto`;
        const response = await fetch(url, {
            method: id ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error('Falha ao salvar moeda');

        fecharModalCripto();
        await carregarCarteira();
    } catch (err) {
        console.error('Erro ao salvar criptomoeda:', err);
        alert('Erro ao salvar moeda na carteira.');
    }
}

async function excluirCripto(id) {
    const item = stateCripto.investimentos.find(i => String(i.id) === String(id));
    if (!item) return;

    if (!(await confirmarAcao(`Tem certeza que deseja remover ${item.ticker} da sua carteira?`, { perigo: true }))) return;

    try {
        const response = await fetch(`${API_BASE}/cripto/${id}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Falha ao excluir moeda');

        await carregarCarteira();
    } catch (err) {
        console.error('Erro ao excluir criptomoeda:', err);
        alert('Erro ao excluir moeda da carteira.');
    }
}

// Modal de Aporte
let itemAporteAtual = null;

function abrirModalAporte(id) {
    const item = stateCripto.investimentos.find(i => String(i.id) === String(id));
    if (!item) return;

    itemAporteAtual = item;
    document.getElementById('formAporteId').value = item.id;
    document.getElementById('aporteModalTitle').textContent = `Comprar Mais: ${item.ticker}`;
    document.getElementById('aporteCurrentShares').textContent = formatarQuantidade(item.shares);
    document.getElementById('aporteCurrentAvg').textContent = formatarMoeda(item.avgPrice);

    document.getElementById('aporteQtd').value = '';
    document.getElementById('aportePreco').value = item.currentPrice || item.avgPrice;

    recalcularPrevisaoAporte();

    document.getElementById('modalAporteOverlay').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function fecharModalAporte() {
    document.getElementById('modalAporteOverlay').classList.remove('active');
    document.body.style.overflow = '';
}

function recalcularPrevisaoAporte() {
    if (!itemAporteAtual) return;

    const novaQtd = parseFloat(document.getElementById('aporteQtd').value) || 0;
    const precoPago = parseFloat(document.getElementById('aportePreco').value) || 0;

    const totalQtd = itemAporteAtual.shares + novaQtd;
    const custoAtual = itemAporteAtual.shares * itemAporteAtual.avgPrice;
    const custoAporte = novaQtd * precoPago;
    const novoPrecoMedio = totalQtd > 0 ? (custoAtual + custoAporte) / totalQtd : 0;

    document.getElementById('prevTotalCotas').textContent = formatarQuantidade(totalQtd);
    document.getElementById('prevCustoAporte').textContent = formatarMoeda(custoAporte);
    document.getElementById('prevNovoPrecoMedio').textContent = formatarMoeda(novoPrecoMedio);
}

async function salvarAporte(e) {
    e.preventDefault();
    if (!itemAporteAtual) return;

    const novaQtd = parseFloat(document.getElementById('aporteQtd').value) || 0;
    const precoPago = parseFloat(document.getElementById('aportePreco').value) || 0;

    if (novaQtd <= 0 || precoPago <= 0) {
        alert('Informe a quantidade e o preço do aporte.');
        return;
    }

    const totalQtd = itemAporteAtual.shares + novaQtd;
    const custoAtual = itemAporteAtual.shares * itemAporteAtual.avgPrice;
    const custoAporte = novaQtd * precoPago;
    const novoPrecoMedio = totalQtd > 0 ? (custoAtual + custoAporte) / totalQtd : itemAporteAtual.avgPrice;

    const payload = mapCriptoToApi({
        ticker: itemAporteAtual.ticker,
        nome: itemAporteAtual.nome,
        moedaId: itemAporteAtual.moedaId,
        segment: itemAporteAtual.segment,
        shares: totalQtd,
        avgPrice: novoPrecoMedio,
        notes: itemAporteAtual.notes
    });

    try {
        const response = await fetch(`${API_BASE}/cripto/${itemAporteAtual.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error('Falha ao registrar aporte');

        fecharModalAporte();
        await carregarCarteira();
    } catch (err) {
        console.error('Erro ao registrar aporte:', err);
        alert('Erro ao registrar aporte da moeda.');
    }
}

function simularCriptoNaCalculadora(id) {
    const item = stateCripto.investimentos.find(i => String(i.id) === String(id));
    if (!item) return;

    // Alternar para aba do Simulador
    const btnCalc = document.querySelector('[data-subtarget="cryptoSubCalculator"]');
    if (btnCalc) btnCalc.click();

    // Preencher campos
    document.getElementById('calcPrecoAtual').value = item.currentPrice || item.avgPrice;
    document.getElementById('calcQuantidadeInicial').value = item.shares;
    document.getElementById('calcValorizacaoMensal').value = 5;
    document.getElementById('calcAporteMensal').value = 500;

    executarSimulacao();
}

// =========================================================
// 8. EXPORTAÇÕES CSV
// =========================================================

function exportarCarteiraCSV() {
    const list = stateCripto.investimentos;
    if (list.length === 0) return;

    const headers = ['Ticker', 'Nome', 'Categoria', 'Quantidade', 'Preco_Medio', 'Preco_Atual', 'Total_Investido', 'Valor_Atual'];
    const rows = list.map(item => {
        const precoRef = item.currentPrice != null ? item.currentPrice : item.avgPrice;
        return [
            item.ticker,
            `"${item.nome}"`,
            `"${item.segment}"`,
            String(item.shares).replace('.', ','),
            item.avgPrice.toFixed(2).replace('.', ','),
            item.currentPrice != null ? item.currentPrice.toFixed(2).replace('.', ',') : '',
            (item.shares * item.avgPrice).toFixed(2).replace('.', ','),
            (item.shares * precoRef).toFixed(2).replace('.', ',')
        ];
    });

    const csvContent = '﻿' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    downloadCSV(csvContent, 'carteira_criptomoedas.csv');
}

function exportarSimulacaoCSV() {
    if (stateCripto.simulacaoDados.length === 0) return;

    const headers = ['Mes', 'Preco_Moeda', 'Aporte_Mes', 'Quantidade_Acumulada', 'Patrimonio_Acumulado'];
    const rows = stateCripto.simulacaoDados.map(r => [
        r.month,
        r.price.toFixed(2).replace('.', ','),
        r.investedThisMonth.toFixed(2).replace('.', ','),
        String(r.quantity).replace('.', ','),
        r.equity.toFixed(2).replace('.', ',')
    ]);

    const csvContent = '﻿' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    downloadCSV(csvContent, 'simulacao_aportes_cripto.csv');
}

function downloadCSV(csvContent, fileName) {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// =========================================================
// 9. UTILITÁRIOS
// =========================================================

function formatarMoeda(valor) {
    const num = Number(valor) || 0;
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatarQuantidade(valor) {
    const num = Number(valor) || 0;
    return num.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 8 });
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
