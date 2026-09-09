/**
 * JS/FII/fii.js
 * Lógica do Módulo de Gestão de Fundos Imobiliários (FIIs Hub)
 * Inclui: Carteira de FIIs, Calculadora Bola de Neve, Gráficos Chart.js, Radar Funds Explorer e Exportação CSV.
 */

// =========================================================
// 1. ESTADO GLOBAL & DADOS
// =========================================================

const API_BASE = '/api';

const stateFII = {
    investimentos: [],
    watchlist: [],
    tema: localStorage.getItem('financehub_theme') || 'dark',
    subAbaAtiva: 'fiiSubPortfolio',
    radarFiltro: 'all',
    radarBusca: '',
    simulacaoDados: []
};

// Dados pré-configurados do Radar Funds Explorer
const RADAR_FIIS = [
    {
        ticker: 'SNAG11',
        name: 'Suno Agro (Fiagro)',
        segment: 'Fiagro',
        segmentFull: 'Fiagro / Agronegócio',
        description: 'Fiagro gerido pela Suno com carteira pulverizada de CRAs e títulos do agronegócio de alta qualidade.',
        precoBase: 10.10,
        dividendoBase: 0.11,
        url: 'https://www.fundsexplorer.com.br/funds/snag11'
    },
    {
        ticker: 'KNSC11',
        name: 'Kinea Securities FII',
        segment: 'Papel',
        segmentFull: 'Papel / CRI Híbrido',
        description: 'Fundo imobiliário de papel da Kinea com carteira diversificada em CRIs indexados ao CDI e IPCA.',
        precoBase: 8.95,
        dividendoBase: 0.085,
        url: 'https://www.fundsexplorer.com.br/funds/knsc11'
    },
    {
        ticker: 'GARE11',
        name: 'Guardian Real Estate',
        segment: 'Híbrido',
        segmentFull: 'Renda Urbana / Logística',
        description: 'Foco em imóveis de renda urbana e galpões logísticos locados para grandes empresas em contratos atípicos.',
        precoBase: 9.20,
        dividendoBase: 0.087,
        url: 'https://www.fundsexplorer.com.br/funds/gare11'
    },
    {
        ticker: 'BTCI11',
        name: 'BTG Pactual Crédito Imobiliário',
        segment: 'Papel',
        segmentFull: 'Papel / CRI',
        description: 'Fundo de papel gerido pelo BTG Pactual com foco em títulos de crédito imobiliário e gestão ativa.',
        precoBase: 9.80,
        dividendoBase: 0.095,
        url: 'https://www.fundsexplorer.com.br/funds/btci11'
    },
    {
        ticker: 'MXRF11',
        name: 'Maxi Renda FII',
        segment: 'Papel',
        segmentFull: 'Papel / CRI',
        description: 'O maior FII da B3 em número de cotistas, focado em CRIs de alta liquidez e equilíbrio de risco.',
        precoBase: 10.20,
        dividendoBase: 0.10,
        url: 'https://www.fundsexplorer.com.br/funds/mxrf11'
    },
    {
        ticker: 'HGLG11',
        name: 'CSHG Logística',
        segment: 'Logística',
        segmentFull: 'Galpões Logísticos',
        description: 'Um dos maiores fundos de tijolo do país, com galpões industriais de altíssimo padrão construtivo.',
        precoBase: 162.50,
        dividendoBase: 1.10,
        url: 'https://www.fundsexplorer.com.br/funds/hglg11'
    },
    {
        ticker: 'XPML11',
        name: 'XP Malls FII',
        segment: 'Shopping',
        segmentFull: 'Shoppings Centers',
        description: 'Portfólio robusto de shoppings centers consolidados em várias regiões do Brasil.',
        precoBase: 110.00,
        dividendoBase: 0.92,
        url: 'https://www.fundsexplorer.com.br/funds/xpml11'
    }
];

// Instâncias de gráficos Chart.js
let chartEvolucao = null;
let chartSegmentos = null;
let chartRenda = null;

// =========================================================
// 2. INICIALIZAÇÃO
// =========================================================

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initMobileNav();
    initSubNavigation();
    initEventListeners();
    carregarCarteira();
    carregarWatchlist();
    renderizarRadar();

    setInterval(() => {
        if (document.visibilityState === 'visible') {
            atualizarCotacoes({ silencioso: true });
        }
    }, FII_COTACOES_AUTO_MS);

    // Recarrega a tabela quando o Assistente de IA adiciona/atualiza um FII pelo chat,
    // sem precisar que o usuário dê F5 (ver JS/Assistente/assistente.js)
    window.addEventListener('financehub:fii-atualizado', carregarCarteira);

    // Iniciar simulação padrão da calculadora
    executarSimulacao();
});

// =========================================================
// 1.1 MAPEAMENTO API <-> ESTADO INTERNO
// =========================================================

function mapFiiFromApi(r) {
    return {
        id: r.id,
        ticker: r.ticker,
        segment: r.segmento,
        shares: r.cotas,
        avgPrice: r.precoMedio,
        lastDividend: r.ultimoDividendo,
        notes: r.observacoes || '',
        currentPrice: r.precoAtual,
        priceUpdatedAt: r.precoAtualizadoEm,
        alertPrice: r.alertaPrecoAbaixoDe
    };
}

function mapFiiToApi(item) {
    return {
        ticker: item.ticker,
        segmento: item.segment,
        cotas: item.shares,
        precoMedio: item.avgPrice,
        ultimoDividendo: item.lastDividend,
        observacoes: item.notes,
        alertaPrecoAbaixoDe: item.alertPrice
    };
}

/**
 * Carrega a carteira de FIIs do usuário logado a partir da API
 */
async function carregarCarteira() {
    try {
        const response = await fetch(`${API_BASE}/fii`, { cache: 'no-store' });
        if (!response.ok) throw new Error('API indisponível');

        const dados = await response.json();
        stateFII.investimentos = dados.map(mapFiiFromApi);
    } catch (err) {
        console.error('[FII Hub] Erro ao carregar carteira:', err.message);
        stateFII.investimentos = [];
    }

    renderizarCarteira();
    atualizarLabelUltimaAtualizacao();
}

const FII_COTACOES_AUTO_MS = 5 * 60 * 1000;

/**
 * Busca as cotações de mercado atuais de todos os FIIs da carteira (Yahoo Finance via backend).
 * Com { silencioso: true } (usado pelo polling automático) não mexe no botão nem exibe alertas de erro.
 */
async function atualizarCotacoes({ silencioso = false } = {}) {
    const btn = document.getElementById('btnAtualizarCotacoes');
    const btnLabel = btn ? btn.querySelector('span') : null;

    if (!silencioso) {
        if (btn) btn.disabled = true;
        if (btnLabel) btnLabel.textContent = 'Atualizando...';
    }

    try {
        const response = await fetch(`${API_BASE}/fii/atualizar-precos`, { method: 'POST' });
        if (!response.ok) throw new Error('Falha ao atualizar cotações');

        const data = await response.json();
        stateFII.investimentos = data.investimentos.map(mapFiiFromApi);
        renderizarCarteira();
        atualizarLabelUltimaAtualizacao();

        const falhas = (data.resultados || []).filter(r => !r.sucesso);
        if (falhas.length > 0 && !silencioso) {
            alert(`Não foi possível atualizar a cotação de: ${falhas.map(f => f.ticker).join(', ')}`);
        }
    } catch (err) {
        console.error('Erro ao atualizar cotações:', err);
        if (!silencioso) {
            alert('Erro ao buscar cotações atualizadas. Tente novamente em instantes.');
        }
    } finally {
        if (!silencioso) {
            if (btn) btn.disabled = false;
            if (btnLabel) btnLabel.textContent = 'Atualizar Cotações';
        }
    }
}

function atualizarLabelUltimaAtualizacao() {
    const label = document.getElementById('fiiUltimaAtualizacao');
    if (!label) return;

    const comData = stateFII.investimentos.filter(i => i.priceUpdatedAt);
    if (comData.length === 0) {
        label.textContent = 'Cotações não atualizadas ainda';
        return;
    }

    const maisRecente = comData.reduce((max, i) => new Date(i.priceUpdatedAt) > new Date(max.priceUpdatedAt) ? i : max);
    const data = new Date(maisRecente.priceUpdatedAt);
    label.textContent = `Cotações atualizadas em ${data.toLocaleDateString('pt-BR')} às ${data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

// =========================================================
// 2.1 LISTA DE OBSERVAÇÃO (ALERTAS DE FIIS FORA DA CARTEIRA)
// =========================================================

function mapWatchlistFromApi(r) {
    return {
        id: r.id,
        ticker: r.ticker,
        alertPrice: r.alertaPrecoAbaixoDe,
        alertDisparado: r.alertaDisparado,
        currentPrice: r.precoAtual,
        priceUpdatedAt: r.precoAtualizadoEm
    };
}

function mapWatchlistToApi(item) {
    return {
        ticker: item.ticker,
        alertaPrecoAbaixoDe: item.alertPrice
    };
}

/**
 * Carrega a Lista de Observação de FIIs fora da carteira. Se a tabela FiiWatchlist ainda
 * não existir no banco (pendente de `prisma db push` manual), falha silenciosamente com
 * lista vazia, sem afetar o resto do módulo.
 */
async function carregarWatchlist() {
    try {
        const response = await fetch(`${API_BASE}/fii/watchlist`, { cache: 'no-store' });
        if (!response.ok) throw new Error('API indisponível');

        const dados = await response.json();
        stateFII.watchlist = dados.map(mapWatchlistFromApi);
    } catch (err) {
        console.warn('[FII Hub] Lista de observação indisponível:', err.message);
        stateFII.watchlist = [];
    }

    renderizarWatchlist();
}

function renderizarWatchlist() {
    const tbody = document.getElementById('watchlistTableBody');
    if (!tbody) return;

    const list = stateFII.watchlist;

    if (list.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 32px; color: var(--text-sub);">
                    Nenhum alerta configurado ainda. Clique em "<strong>Adicionar Alerta</strong>" acima para acompanhar um FII fora da sua carteira.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = list.map(item => `
        <tr>
            <td><strong>${escapeHTML(item.ticker)}</strong></td>
            <td>${item.currentPrice != null ? formatarMoeda(item.currentPrice) : '—'}</td>
            <td>${formatarMoeda(item.alertPrice)}</td>
            <td>${item.alertDisparado
                ? '<span class="status-pill" style="color: var(--color-expense); border-color: var(--color-expense);">🔻 Disparado</span>'
                : '<span class="status-pill">Monitorando</span>'}</td>
            <td>${item.priceUpdatedAt ? new Date(item.priceUpdatedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
            <td>
                <div class="table-action-btns">
                    <button class="btn-fii-action" onclick="abrirModalWatchlist('${item.id}')" title="Editar Alerta">✏️</button>
                    <button class="btn-fii-action delete" onclick="excluirWatchlistItem('${item.id}')" title="Remover da Lista de Observação">🗑️</button>
                </div>
            </td>
        </tr>
    `).join('');
}

function abrirModalWatchlist(id = null) {
    const form = document.getElementById('watchlistForm');
    form.reset();

    if (id) {
        const item = stateFII.watchlist.find(i => String(i.id) === String(id));
        if (item) {
            document.getElementById('modalWatchlistTitle').textContent = `Editar Alerta: ${item.ticker}`;
            document.getElementById('formWatchlistId').value = item.id;
            document.getElementById('inputWatchlistTicker').value = item.ticker;
            document.getElementById('inputWatchlistAlertPrice').value = item.alertPrice;
        }
    } else {
        document.getElementById('modalWatchlistTitle').textContent = 'Adicionar Alerta';
        document.getElementById('formWatchlistId').value = '';
    }

    document.getElementById('modalWatchlistOverlay').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function fecharModalWatchlist() {
    document.getElementById('modalWatchlistOverlay').classList.remove('active');
    document.body.style.overflow = '';
}

let chartHistoricoFii = null;

async function abrirModalHistoricoFii(id, ticker) {
    document.getElementById('modalHistoricoFiiTitle').textContent = `Histórico de Preço: ${ticker}`;
    document.getElementById('modalHistoricoFiiOverlay').classList.add('active');
    document.body.style.overflow = 'hidden';

    const vazio = document.getElementById('historicoFiiVazio');
    const canvas = document.getElementById('chartHistoricoFii');
    vazio.style.display = 'none';
    canvas.style.display = '';

    try {
        const resp = await fetch(`/api/fii/${id}/historico`);
        if (!resp.ok) throw new Error('Falha ao buscar histórico');
        const historico = await resp.json();

        if (!Array.isArray(historico) || historico.length < 2) {
            vazio.style.display = 'flex';
            canvas.style.display = 'none';
            if (chartHistoricoFii) { chartHistoricoFii.destroy(); chartHistoricoFii = null; }
            return;
        }

        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const textColor = isDark ? '#FFFFFF' : '#1C1C1E';
        const gridColor = isDark ? '#2C2C2E' : '#E5E5EA';

        if (chartHistoricoFii) chartHistoricoFii.destroy();
        chartHistoricoFii = new Chart(canvas, {
            type: 'line',
            data: {
                labels: historico.map(h => new Date(h.dia).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })),
                datasets: [{
                    label: 'Preço da Cota',
                    data: historico.map(h => h.preco),
                    borderColor: '#EEBB00',
                    backgroundColor: 'rgba(238, 187, 0, 0.12)',
                    fill: true,
                    tension: 0.3,
                    pointRadius: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: (ctx) => ` ${formatarMoeda(ctx.raw)}` } }
                },
                scales: {
                    x: { grid: { display: false }, ticks: { color: textColor } },
                    y: { grid: { color: gridColor }, ticks: { color: textColor, callback: (v) => formatarMoeda(v) } }
                }
            }
        });
    } catch (err) {
        console.warn('[FII] Não foi possível carregar o histórico de preço.', err.message);
        vazio.style.display = 'flex';
        canvas.style.display = 'none';
    }
}

function fecharModalHistoricoFii() {
    document.getElementById('modalHistoricoFiiOverlay').classList.remove('active');
    document.body.style.overflow = '';
}

async function salvarWatchlistItem(e) {
    e.preventDefault();

    const id = document.getElementById('formWatchlistId').value;
    const ticker = document.getElementById('inputWatchlistTicker').value.trim().toUpperCase();
    const alertPriceRaw = document.getElementById('inputWatchlistAlertPrice').value;
    const alertPrice = alertPriceRaw !== '' ? parseFloat(alertPriceRaw) : null;

    if (!ticker || !alertPrice || alertPrice <= 0) {
        alert('Preencha o ticker e um preço de alerta válido.');
        return;
    }

    const payload = mapWatchlistToApi({ ticker, alertPrice });

    try {
        const url = id ? `${API_BASE}/fii/watchlist/${id}` : `${API_BASE}/fii/watchlist`;
        const response = await fetch(url, {
            method: id ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error('Falha ao salvar alerta');

        fecharModalWatchlist();
        await carregarWatchlist();
    } catch (err) {
        console.error('Erro ao salvar item da lista de observação:', err);
        alert('Erro ao salvar o alerta. Se o problema persistir, pode ser que a tabela ainda não tenha sido criada no banco.');
    }
}

async function excluirWatchlistItem(id) {
    const item = stateFII.watchlist.find(i => String(i.id) === String(id));
    if (!item) return;

    if (!confirm(`Remover o alerta de ${item.ticker} da lista de observação?`)) return;

    try {
        const response = await fetch(`${API_BASE}/fii/watchlist/${id}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Falha ao excluir item');

        await carregarWatchlist();
    } catch (err) {
        console.error('Erro ao excluir item da lista de observação:', err);
        alert('Erro ao remover o alerta.');
    }
}

// =========================================================
// 3. TEMA E NAVEGAÇÃO
// =========================================================

function initTheme() {
    const root = document.documentElement;
    const themeToggleBtn = document.getElementById('themeToggleBtn');

    applyTheme(stateFII.tema);

    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            stateFII.tema = stateFII.tema === 'dark' ? 'light' : 'dark';
            applyTheme(stateFII.tema);
            localStorage.setItem('financehub_theme', stateFII.tema);
            
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
            stateFII.subAbaAtiva = targetId;

            document.querySelectorAll('.fii-subview').forEach(view => {
                view.classList.remove('active');
            });

            const targetView = document.getElementById(targetId);
            if (targetView) {
                targetView.classList.add('active');
            }

            if (targetId === 'fiiSubPortfolio') {
                renderizarCarteira();
            } else if (targetId === 'fiiSubCalculator') {
                executarSimulacao();
            } else if (targetId === 'fiiSubRadar') {
                renderizarRadar();
            } else if (targetId === 'fiiSubWatchlist') {
                renderizarWatchlist();
            }
        });
    });
}

function initEventListeners() {
    // Botões de Abertura de Modais
    const btnNovoFiiHeader = document.getElementById('btnNovoFiiHeader');
    const btnAdicionarFii = document.getElementById('btnAdicionarFii');
    if (btnNovoFiiHeader) btnNovoFiiHeader.addEventListener('click', () => abrirModalFII());
    if (btnAdicionarFii) btnAdicionarFii.addEventListener('click', () => abrirModalFII());

    // Fechamento de Modais
    const modalFiiClose = document.getElementById('modalFiiClose');
    const btnFiiCancel = document.getElementById('btnFiiCancel');
    const modalFiiOverlay = document.getElementById('modalFiiOverlay');

    if (modalFiiClose) modalFiiClose.addEventListener('click', fecharModalFII);
    if (btnFiiCancel) btnFiiCancel.addEventListener('click', fecharModalFII);
    if (modalFiiOverlay) {
        modalFiiOverlay.addEventListener('click', (e) => {
            if (e.target === modalFiiOverlay) fecharModalFII();
        });
    }

    // Modal de Aporte / Compra de Cotas
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

    // Modal de Lista de Observação
    const btnAdicionarWatchlist = document.getElementById('btnAdicionarWatchlist');
    if (btnAdicionarWatchlist) btnAdicionarWatchlist.addEventListener('click', () => abrirModalWatchlist());

    const modalWatchlistClose = document.getElementById('modalWatchlistClose');
    const btnWatchlistCancel = document.getElementById('btnWatchlistCancel');
    const modalWatchlistOverlay = document.getElementById('modalWatchlistOverlay');

    if (modalWatchlistClose) modalWatchlistClose.addEventListener('click', fecharModalWatchlist);
    if (btnWatchlistCancel) btnWatchlistCancel.addEventListener('click', fecharModalWatchlist);
    if (modalWatchlistOverlay) {
        modalWatchlistOverlay.addEventListener('click', (e) => {
            if (e.target === modalWatchlistOverlay) fecharModalWatchlist();
        });
    }

    // Modal de Histórico de Preço
    const modalHistoricoFiiClose = document.getElementById('modalHistoricoFiiClose');
    const modalHistoricoFiiOverlay = document.getElementById('modalHistoricoFiiOverlay');
    if (modalHistoricoFiiClose) modalHistoricoFiiClose.addEventListener('click', fecharModalHistoricoFii);
    if (modalHistoricoFiiOverlay) {
        modalHistoricoFiiOverlay.addEventListener('click', (e) => {
            if (e.target === modalHistoricoFiiOverlay) fecharModalHistoricoFii();
        });
    }

    // Formulários
    const fiiForm = document.getElementById('fiiForm');
    if (fiiForm) fiiForm.addEventListener('submit', salvarFII);

    const aporteForm = document.getElementById('aporteForm');
    if (aporteForm) aporteForm.addEventListener('submit', salvarAporte);

    const watchlistForm = document.getElementById('watchlistForm');
    if (watchlistForm) watchlistForm.addEventListener('submit', salvarWatchlistItem);

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

    const switchReinvestir = document.getElementById('calcReinvestir');
    if (switchReinvestir) {
        switchReinvestir.addEventListener('change', () => {
            executarSimulacao();
        });
    }

    // Atualização de Cotações de Mercado
    const btnAtualizarCotacoes = document.getElementById('btnAtualizarCotacoes');
    if (btnAtualizarCotacoes) btnAtualizarCotacoes.addEventListener('click', () => atualizarCotacoes());

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
            stateFII.radarFiltro = pill.getAttribute('data-segment');
            renderizarRadar();
        });
    });

    const radarSearchInput = document.getElementById('radarSearchInput');
    if (radarSearchInput) {
        radarSearchInput.addEventListener('input', (e) => {
            stateFII.radarBusca = e.target.value.toLowerCase().trim();
            renderizarRadar();
        });
    }

    // Gatilhos no Modal de Aporte
    const aporteQtd = document.getElementById('aporteQtd');
    const aportePreco = document.getElementById('aportePreco');
    const aporteDividendo = document.getElementById('aporteDividendo');

    [aporteQtd, aportePreco, aporteDividendo].forEach(elem => {
        if (elem) elem.addEventListener('input', recalcularPrevisaoAporte);
    });

    // Pílulas de quantidade rápida (+1, +5, +10...)
    const quickPills = document.querySelectorAll('.quick-pill');
    quickPills.forEach(pill => {
        pill.addEventListener('click', () => {
            const addVal = parseInt(pill.getAttribute('data-add'), 10) || 0;
            const current = parseInt(aporteQtd.value, 10) || 0;
            aporteQtd.value = current + addVal;
            recalcularPrevisaoAporte();
        });
    });
}

// =========================================================
// 4. CARTEIRA DE FIIS (TABELA, KPIS & GRÁFICOS)
// =========================================================

function renderizarCarteira() {
    const list = stateFII.investimentos;

    let totalInvestido = 0;
    let totalMercado = 0;
    let rendaMensalTotal = 0;
    let totalCotas = 0;

    const segmentMap = {};
    const fiiIncomeList = [];

    list.forEach(item => {
        const investido = (item.shares || 0) * (item.avgPrice || 0);
        const precoRef = item.currentPrice != null ? item.currentPrice : item.avgPrice;
        const renda = (item.shares || 0) * (item.lastDividend || 0);

        totalInvestido += investido;
        totalMercado += (item.shares || 0) * (precoRef || 0);
        rendaMensalTotal += renda;
        totalCotas += (item.shares || 0);

        const seg = item.segment || 'Outro';
        segmentMap[seg] = (segmentMap[seg] || 0) + investido;

        fiiIncomeList.push({
            ticker: item.ticker,
            income: renda
        });
    });

    const yieldMedio = totalInvestido > 0 ? (rendaMensalTotal / totalInvestido) * 100 : 0;
    const valorizacao = totalMercado - totalInvestido;
    const valorizacaoPct = totalInvestido > 0 ? (valorizacao / totalInvestido) * 100 : 0;

    // Atualizar KPIs
    document.getElementById('kpiPatrimonioTotal').textContent = formatarMoeda(totalMercado);
    document.getElementById('kpiPatrimonioSub').textContent = `Custo de aquisição: ${formatarMoeda(totalInvestido)}`;
    document.getElementById('kpiRendaMensal').textContent = formatarMoeda(rendaMensalTotal);
    document.getElementById('kpiYieldMedio').textContent = yieldMedio.toFixed(2) + '% a.m.';
    document.getElementById('kpiTotalCotas').textContent = totalCotas.toLocaleString('pt-BR');

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
    const badgeFiiCount = document.getElementById('badgeFiiCount');
    if (badgeFiiCount) badgeFiiCount.textContent = list.length;

    // Renderizar Linhas da Tabela
    const tbody = document.getElementById('fiiTableBody');
    if (!tbody) return;

    if (list.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="11" style="text-align: center; padding: 32px; color: var(--text-sub);">
                    Nenhum Fundo Imobiliário cadastrado ainda. Clique em "<strong>+ Adicionar FII</strong>" acima para iniciar sua carteira!
                </td>
            </tr>
        `;
    } else {
        tbody.innerHTML = list.map(item => {
            const investido = item.shares * item.avgPrice;
            const renda = item.shares * item.lastDividend;
            const yieldOnCost = item.avgPrice > 0 ? (item.lastDividend / item.avgPrice) * 100 : 0;
            const temCotacao = item.currentPrice != null;
            const valorizacaoItemPct = temCotacao && item.avgPrice > 0
                ? ((item.currentPrice - item.avgPrice) / item.avgPrice) * 100
                : null;

            return `
                <tr>
                    <td>
                        <span class="ticker-badge-cell">${escapeHTML(item.ticker)}</span>
                        ${item.notes ? `<div style="font-size: 0.75rem; color: var(--text-sub); margin-top: 2px;">${escapeHTML(item.notes)}</div>` : ''}
                        ${item.alertPrice != null ? `<div style="font-size: 0.75rem; color: var(--accent-color); margin-top: 2px;" title="Alerta por e-mail se cair abaixo deste valor">🔔 abaixo de ${formatarMoeda(item.alertPrice)}</div>` : ''}
                    </td>
                    <td><span class="segment-tag-cell">${escapeHTML(item.segment)}</span></td>
                    <td><strong>${item.shares.toLocaleString('pt-BR')}</strong></td>
                    <td>${formatarMoeda(item.avgPrice)}</td>
                    <td>${temCotacao ? formatarMoeda(item.currentPrice) : '<span style="color: var(--text-sub);">—</span>'}</td>
                    <td>${valorizacaoItemPct !== null
                        ? `<strong style="color: var(--color-${valorizacaoItemPct >= 0 ? 'income' : 'expense'});">${valorizacaoItemPct >= 0 ? '+' : ''}${valorizacaoItemPct.toFixed(2)}%</strong>`
                        : '<span style="color: var(--text-sub);">—</span>'}</td>
                    <td><strong style="color: var(--text-main);">${formatarMoeda(investido)}</strong></td>
                    <td>${formatarMoeda(item.lastDividend)}</td>
                    <td><strong style="color: var(--color-income);">${formatarMoeda(renda)}</strong></td>
                    <td><span style="color: var(--accent-color); font-weight: 700;">${yieldOnCost.toFixed(2)}%</span></td>
                    <td>
                        <div class="table-action-btns">
                            <button class="btn-fii-action" onclick="abrirModalAporte('${item.id}')" title="Comprar mais cotas">
                                ➕ Aportar
                            </button>
                            <button class="btn-fii-action" onclick="simularFiiNaCalculadora('${item.id}')" title="Simular na Calculadora">
                                ⚡ Simular
                            </button>
                            <button class="btn-fii-action" onclick="abrirModalHistoricoFii('${item.id}', '${escapeHTML(item.ticker)}')" title="Ver histórico de preço">
                                📈
                            </button>
                            <button class="btn-fii-action" onclick="abrirModalFII('${item.id}')" title="Editar FII">
                                ✏️
                            </button>
                            <button class="btn-fii-action delete" onclick="excluirFII('${item.id}')" title="Excluir da Carteira">
                                🗑️
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // Gráficos
    renderizarGraficosCarteira(segmentMap, fiiIncomeList);
}

function renderizarGraficosCarteira(segmentMap, fiiIncomeList) {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#FFFFFF' : '#1C1C1E';
    const borderColor = isDark ? '#2C2C2E' : '#E5E5EA';

    // 1. Gráfico de Segmentos (Doughnut)
    const ctxSegment = document.getElementById('chartSegmentos');
    if (ctxSegment) {
        if (chartSegmentos) chartSegmentos.destroy();

        const labels = Object.keys(segmentMap);
        const data = Object.values(segmentMap);

        chartSegmentos = new Chart(ctxSegment, {
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

    // 2. Gráfico de Renda Mensal por FII (Bar)
    const ctxRenda = document.getElementById('chartRenda');
    if (ctxRenda) {
        if (chartRenda) chartRenda.destroy();

        const labels = fiiIncomeList.map(i => i.ticker);
        const data = fiiIncomeList.map(i => i.income);

        chartRenda = new Chart(ctxRenda, {
            type: 'bar',
            data: {
                labels: labels.length > 0 ? labels : ['Nenhum'],
                datasets: [{
                    label: 'Renda Mensal R$',
                    data: data.length > 0 ? data : [0],
                    backgroundColor: '#EEBB00',
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
                            label: (ctx) => ` Renda: ${formatarMoeda(ctx.raw)}`
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
// 5. CALCULADORA & SIMULADOR BOLA DE NEVE
// =========================================================

function executarSimulacao() {
    const sharePrice = parseFloat(document.getElementById('calcPrecoCota')?.value) || 0;
    const lastDividend = parseFloat(document.getElementById('calcDividendo')?.value) || 0;
    const monthlyInvestment = parseFloat(document.getElementById('calcAporteMensal')?.value) || 0;
    const durationInput = parseInt(document.getElementById('calcPrazo')?.value, 10) || 0;
    const durationUnit = document.getElementById('calcUnidadePrazo')?.value || 'years';
    const initialShares = parseInt(document.getElementById('calcCotasIniciais')?.value, 10) || 0;
    const reinvestDividends = document.getElementById('calcReinvestir')?.checked ?? true;

    const totalMonths = durationUnit === 'years' ? durationInput * 12 : durationInput;

    let currentShares = initialShares;
    let leftover = 0.0;
    let accumulatedInvested = 0.0;
    let accumulatedReinvested = 0.0;

    stateFII.simulacaoDados = [];

    const initialEquity = initialShares * sharePrice;

    if (sharePrice > 0) {
        for (let month = 1; month <= totalMonths; month++) {
            const cashFromInvestment = monthlyInvestment + leftover;
            accumulatedInvested += monthlyInvestment;
            const newSharesFromInvestment = Math.floor(cashFromInvestment / sharePrice);
            leftover = cashFromInvestment - (newSharesFromInvestment * sharePrice);
            currentShares += newSharesFromInvestment;

            const sharesBeforeDividends = currentShares;
            const dividendsReceived = sharesBeforeDividends * lastDividend;

            let monthlyReinvestedVal = 0.0;
            if (reinvestDividends) {
                const reinvestCash = dividendsReceived + leftover;
                monthlyReinvestedVal = reinvestCash;
                const newSharesFromReinvest = Math.floor(reinvestCash / sharePrice);
                leftover = reinvestCash - (newSharesFromReinvest * sharePrice);
                currentShares += newSharesFromReinvest;
                accumulatedReinvested += dividendsReceived;
            }

            const monthlyEquity = (currentShares * sharePrice) + leftover;

            stateFII.simulacaoDados.push({
                month: month,
                shares: currentShares,
                investedThisMonth: monthlyInvestment,
                reinvestmentThisMonth: monthlyReinvestedVal,
                dividendsThisMonth: dividendsReceived,
                totalInvestedCumulative: accumulatedInvested + initialEquity,
                equityCumulative: monthlyEquity
            });
        }
    }

    const finalEquity = (currentShares * sharePrice) + leftover;
    const finalMonthDividends = currentShares * lastDividend;

    // Atualizar UI de Resultados
    document.getElementById('calcResPatrimonioInicial').textContent = formatarMoeda(initialEquity);
    document.getElementById('calcResPatrimonioFinal').textContent = formatarMoeda(finalEquity);
    
    const durationLabel = durationInput === 1 
        ? (durationUnit === 'years' ? '1 Ano' : '1 Mês') 
        : `${durationInput} ${durationUnit === 'years' ? 'Anos' : 'Meses'}`;
    
    document.getElementById('calcResPrazo').textContent = durationLabel;
    document.getElementById('calcResTotalAportado').textContent = formatarMoeda(accumulatedInvested);
    document.getElementById('calcResTotalReinvestido').textContent = formatarMoeda(accumulatedReinvested);
    document.getElementById('calcResRendaFinal').textContent = formatarMoeda(finalMonthDividends);

    renderizarTabelaSimulacao();
    renderizarGraficoEvolucao();
}

function renderizarTabelaSimulacao() {
    const tbody = document.getElementById('simulacaoTableBody');
    if (!tbody) return;

    tbody.innerHTML = stateFII.simulacaoDados.map(row => `
        <tr>
            <td><strong>${row.month}º mês</strong></td>
            <td>${row.shares.toLocaleString('pt-BR')}</td>
            <td>${formatarMoeda(row.investedThisMonth)}</td>
            <td>${formatarMoeda(row.reinvestmentThisMonth)}</td>
            <td style="color: var(--color-income); font-weight: 700;">${formatarMoeda(row.dividendsThisMonth)}</td>
            <td><strong style="color: var(--accent-color);">${formatarMoeda(row.equityCumulative)}</strong></td>
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

    const labels = stateFII.simulacaoDados.map(r => `${r.month}º Mês`);
    const dataPatrimonio = stateFII.simulacaoDados.map(r => r.equityCumulative);
    const dataAportado = stateFII.simulacaoDados.map(r => r.totalInvestedCumulative);

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
    renderizarGraficosCarteira(
        stateFII.investimentos.reduce((acc, curr) => {
            const seg = curr.segment || 'Outro';
            acc[seg] = (acc[seg] || 0) + (curr.shares * curr.avgPrice);
            return acc;
        }, {}),
        stateFII.investimentos.map(i => ({ ticker: i.ticker, income: i.shares * i.lastDividend }))
    );
    renderizarGraficoEvolucao();
}

// =========================================================
// 6. RADAR FUNDS EXPLORER
// =========================================================

function renderizarRadar() {
    const container = document.getElementById('radarGrid');
    if (!container) return;

    let lista = RADAR_FIIS;

    if (stateFII.radarFiltro !== 'all') {
        lista = lista.filter(f => f.segment.toLowerCase() === stateFII.radarFiltro.toLowerCase());
    }

    if (stateFII.radarBusca) {
        lista = lista.filter(f => 
            f.ticker.toLowerCase().includes(stateFII.radarBusca) || 
            f.name.toLowerCase().includes(stateFII.radarBusca) ||
            f.description.toLowerCase().includes(stateFII.radarBusca)
        );
    }

    if (lista.length === 0) {
        container.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--text-sub);">
                Nenhum FII encontrado no Radar para os filtros aplicados.
            </div>
        `;
        return;
    }

    container.innerHTML = lista.map(fii => `
        <article class="radar-fii-card">
            <div>
                <div class="radar-card-header">
                    <div>
                        <h3 class="radar-ticker-title">${fii.ticker}</h3>
                        <p class="radar-fii-name">${fii.name}</p>
                    </div>
                    <span class="segment-tag-cell">${fii.segmentFull}</span>
                </div>
                <p class="radar-fii-desc" style="margin-top: 14px;">${fii.description}</p>
            </div>

            <footer class="radar-card-footer">
                <a href="${fii.url}" target="_blank" rel="noopener noreferrer" class="btn-radar-link">
                    <span>Funds Explorer</span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                        <polyline points="15 3 21 3 21 9"></polyline>
                        <line x1="10" y1="14" x2="21" y2="3"></line>
                    </svg>
                </a>
                <button class="btn-add-from-radar" onclick="adicionarFiiDoRadar('${fii.ticker}', '${fii.segmentFull}', ${fii.precoBase}, ${fii.dividendoBase})">
                    + Adicionar à Carteira
                </button>
            </footer>
        </article>
    `).join('');
}

function adicionarFiiDoRadar(ticker, segment, preco, dividendo) {
    abrirModalFII();
    document.getElementById('inputFiiTicker').value = ticker;
    document.getElementById('inputFiiSegment').value = segment.includes('Papel') ? 'Papel / CRI' : (segment.includes('Fiagro') ? 'Fiagro' : (segment.includes('Logística') ? 'Logística' : 'Híbrido'));
    document.getElementById('inputFiiAvgPrice').value = preco;
    document.getElementById('inputFiiLastDividend').value = dividendo;
    document.getElementById('inputFiiShares').value = 100;
}

// =========================================================
// 7. MODAIS & AÇÕES DE CARTEIRA
// =========================================================

function abrirModalFII(id = null) {
    const form = document.getElementById('fiiForm');
    form.reset();

    if (id) {
        const item = stateFII.investimentos.find(i => String(i.id) === String(id));
        if (item) {
            document.getElementById('modalFiiTitle').textContent = `Editar: ${item.ticker}`;
            document.getElementById('formFiiId').value = item.id;
            document.getElementById('inputFiiTicker').value = item.ticker;
            document.getElementById('inputFiiSegment').value = item.segment;
            document.getElementById('inputFiiShares').value = item.shares;
            document.getElementById('inputFiiAvgPrice').value = item.avgPrice;
            document.getElementById('inputFiiLastDividend').value = item.lastDividend;
            document.getElementById('inputFiiNotes').value = item.notes || '';
            document.getElementById('inputFiiAlertPrice').value = item.alertPrice != null ? item.alertPrice : '';
        }
    } else {
        document.getElementById('modalFiiTitle').textContent = 'Adicionar FII à Carteira';
        document.getElementById('formFiiId').value = '';
        document.getElementById('inputFiiSegment').value = 'Papel / CRI';
    }

    document.getElementById('modalFiiOverlay').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function fecharModalFII() {
    document.getElementById('modalFiiOverlay').classList.remove('active');
    document.body.style.overflow = '';
}

async function salvarFII(e) {
    e.preventDefault();

    const id = document.getElementById('formFiiId').value;
    const ticker = document.getElementById('inputFiiTicker').value.trim().toUpperCase();
    const segment = document.getElementById('inputFiiSegment').value;
    const shares = parseInt(document.getElementById('inputFiiShares').value, 10) || 0;
    const avgPrice = parseFloat(document.getElementById('inputFiiAvgPrice').value) || 0;
    const lastDividend = parseFloat(document.getElementById('inputFiiLastDividend').value) || 0;
    const notes = document.getElementById('inputFiiNotes').value.trim();
    const alertPriceRaw = document.getElementById('inputFiiAlertPrice').value;
    const alertPrice = alertPriceRaw !== '' ? parseFloat(alertPriceRaw) : null;

    if (!ticker || shares <= 0 || avgPrice <= 0) {
        alert('Preencha os campos obrigatórios corretamente.');
        return;
    }

    const payload = mapFiiToApi({ ticker, segment, shares, avgPrice, lastDividend, notes, alertPrice });

    try {
        const url = id ? `${API_BASE}/fii/${id}` : `${API_BASE}/fii`;
        const response = await fetch(url, {
            method: id ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error('Falha ao salvar FII');

        fecharModalFII();
        await carregarCarteira();
    } catch (err) {
        console.error('Erro ao salvar FII:', err);
        alert('Erro ao salvar FII na carteira.');
    }
}

async function excluirFII(id) {
    const item = stateFII.investimentos.find(i => String(i.id) === String(id));
    if (!item) return;

    if (!confirm(`Tem certeza que deseja remover ${item.ticker} da sua carteira?`)) return;

    try {
        const response = await fetch(`${API_BASE}/fii/${id}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Falha ao excluir FII');

        await carregarCarteira();
    } catch (err) {
        console.error('Erro ao excluir FII:', err);
        alert('Erro ao excluir FII da carteira.');
    }
}

// Modal de Aporte
let itemAporteAtual = null;

function abrirModalAporte(id) {
    const item = stateFII.investimentos.find(i => String(i.id) === String(id));
    if (!item) return;

    itemAporteAtual = item;
    document.getElementById('formAporteId').value = item.id;
    document.getElementById('aporteModalTitle').textContent = `Comprar Mais Cotas: ${item.ticker}`;
    document.getElementById('aporteCurrentShares').textContent = item.shares.toLocaleString('pt-BR');
    document.getElementById('aporteCurrentAvg').textContent = formatarMoeda(item.avgPrice);
    document.getElementById('aporteCurrentDiv').textContent = formatarMoeda(item.lastDividend);

    document.getElementById('aporteQtd').value = 10;
    document.getElementById('aportePreco').value = item.avgPrice;
    document.getElementById('aporteDividendo').value = item.lastDividend;

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

    const novasCotas = parseInt(document.getElementById('aporteQtd').value, 10) || 0;
    const precoPago = parseFloat(document.getElementById('aportePreco').value) || 0;
    const novoDiv = parseFloat(document.getElementById('aporteDividendo').value) || itemAporteAtual.lastDividend;

    const totalCotas = itemAporteAtual.shares + novasCotas;
    const custoAtual = itemAporteAtual.shares * itemAporteAtual.avgPrice;
    const custoAporte = novasCotas * precoPago;
    const novoPrecoMedio = totalCotas > 0 ? (custoAtual + custoAporte) / totalCotas : 0;
    const novaRenda = totalCotas * novoDiv;

    document.getElementById('prevTotalCotas').textContent = totalCotas.toLocaleString('pt-BR');
    document.getElementById('prevCustoAporte').textContent = formatarMoeda(custoAporte);
    document.getElementById('prevNovoPrecoMedio').textContent = formatarMoeda(novoPrecoMedio);
    document.getElementById('prevNovaRenda').textContent = formatarMoeda(novaRenda);
}

async function salvarAporte(e) {
    e.preventDefault();
    if (!itemAporteAtual) return;

    const novasCotas = parseInt(document.getElementById('aporteQtd').value, 10) || 0;
    const precoPago = parseFloat(document.getElementById('aportePreco').value) || 0;
    const novoDiv = parseFloat(document.getElementById('aporteDividendo').value) || itemAporteAtual.lastDividend;

    if (novasCotas <= 0 || precoPago <= 0) {
        alert('Informe a quantidade e o preço do aporte.');
        return;
    }

    const totalCotas = itemAporteAtual.shares + novasCotas;
    const custoAtual = itemAporteAtual.shares * itemAporteAtual.avgPrice;
    const custoAporte = novasCotas * precoPago;
    const novoPrecoMedio = totalCotas > 0 ? (custoAtual + custoAporte) / totalCotas : itemAporteAtual.avgPrice;

    const payload = mapFiiToApi({
        ticker: itemAporteAtual.ticker,
        segment: itemAporteAtual.segment,
        shares: totalCotas,
        avgPrice: novoPrecoMedio,
        lastDividend: novoDiv,
        notes: itemAporteAtual.notes
    });

    try {
        const response = await fetch(`${API_BASE}/fii/${itemAporteAtual.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error('Falha ao registrar aporte');

        fecharModalAporte();
        await carregarCarteira();
    } catch (err) {
        console.error('Erro ao registrar aporte:', err);
        alert('Erro ao registrar aporte do FII.');
    }
}

function simularFiiNaCalculadora(id) {
    const item = stateFII.investimentos.find(i => String(i.id) === String(id));
    if (!item) return;

    // Alternar para aba da Calculadora
    const btnCalc = document.querySelector('[data-subtarget="fiiSubCalculator"]');
    if (btnCalc) btnCalc.click();

    // Preencher campos
    document.getElementById('calcPrecoCota').value = item.avgPrice;
    document.getElementById('calcDividendo').value = item.lastDividend;
    document.getElementById('calcCotasIniciais').value = item.shares;
    document.getElementById('calcAporteMensal').value = 500;

    executarSimulacao();
}

// =========================================================
// 8. EXPORTAÇÕES CSV
// =========================================================

function exportarCarteiraCSV() {
    const list = stateFII.investimentos;
    if (list.length === 0) return;

    const headers = ['Ticker', 'Segmento', 'Cotas', 'Preco_Medio', 'Total_Investido', 'Ultimo_Dividendo', 'Renda_Mensal', 'Yield_on_Cost_Pct'];
    const rows = list.map(item => [
        item.ticker,
        `"${item.segment}"`,
        item.shares,
        item.avgPrice.toFixed(2).replace('.', ','),
        (item.shares * item.avgPrice).toFixed(2).replace('.', ','),
        item.lastDividend.toFixed(2).replace('.', ','),
        (item.shares * item.lastDividend).toFixed(2).replace('.', ','),
        ((item.lastDividend / item.avgPrice) * 100).toFixed(2).replace('.', ',')
    ]);

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    downloadCSV(csvContent, 'carteira_fundos_imobiliarios.csv');
}

function exportarSimulacaoCSV() {
    if (stateFII.simulacaoDados.length === 0) return;

    const headers = ['Mes', 'Cotas_Acumuladas', 'Aporte_Mes', 'Reinvestimento_Mes', 'Dividendo_Mes', 'Patrimonio_Acumulado'];
    const rows = stateFII.simulacaoDados.map(r => [
        r.month,
        r.shares,
        r.investedThisMonth.toFixed(2).replace('.', ','),
        r.reinvestmentThisMonth.toFixed(2).replace('.', ','),
        r.dividendsThisMonth.toFixed(2).replace('.', ','),
        r.equityCumulative.toFixed(2).replace('.', ',')
    ]);

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    downloadCSV(csvContent, 'simulacao_bola_de_neve_fiis.csv');
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

function escapeHTML(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
