/**
 * app.js - Lógica Principal do Business Hub
 * Integração: Fundos Imobiliários & Administração de Carros de Leilão com Planilha estilo Excel.
 */

// =========================================================
// 1. FORMATADORES & HELPERS
// =========================================================

function formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value || 0);
}

function formatNumber(value) {
    return new Intl.NumberFormat('pt-BR').format(value || 0);
}

function formatPercent(value) {
    return (value || 0).toLocaleString('pt-BR', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1
    }) + '%';
}

function formatDateBR(dateStr) {
    if (!dateStr) return '--';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '⚠️';

    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('show');
    }, 10);

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 350);
    }, 3500);
}

function getSegmentBadgeClass(segment) {
    const s = (segment || '').toLowerCase();
    if (s.includes('papel')) return 'badge-papel';
    if (s.includes('logística') || s.includes('logistica')) return 'badge-logistica';
    if (s.includes('shopping')) return 'badge-shopping';
    if (s.includes('lajes') || s.includes('corporativ')) return 'badge-lajes';
    if (s.includes('fiagro') || s.includes('agro')) return 'badge-fiagro';
    if (s.includes('híbrido') || s.includes('hibrido')) return 'badge-hibrido';
    if (s.includes('fof') || s.includes('fundos de fundos')) return 'badge-fof';
    return 'badge-outro';
}

function getCarStatusBadgeClass(status) {
    const s = (status || '').toLowerCase();
    if (s.includes('reforma') || s.includes('oficina') || s.includes('preparação')) return 'badge-car-preparacao';
    if (s.includes('venda')) return 'badge-car-venda';
    if (s.includes('vendido')) return 'badge-car-vendido';
    return 'badge-car-preparacao';
}

// =========================================================
// 2. DADOS DO RADAR FUNDS EXPLORER (5 FIIS)
// =========================================================

const RADAR_FIIS_DATA = [
    {
        ticker: 'SNAG11',
        name: 'Suno Agro (Fiagro)',
        segment: 'Fiagro',
        segmentFull: 'Fiagro / Agronegócio',
        description: 'Fiagro gerido pela Suno com carteira pulverizada de CRAs e títulos do agronegócio de alta qualidade.',
        fundsExplorerUrl: 'https://www.fundsexplorer.com.br/funds/snag11'
    },
    {
        ticker: 'KNSC11',
        name: 'Kinea Securities FII',
        segment: 'Papel',
        segmentFull: 'Papel / CRI Híbrido',
        description: 'Fundo imobiliário de papel da Kinea com carteira diversificada em CRIs indexados ao CDI e IPCA.',
        fundsExplorerUrl: 'https://www.fundsexplorer.com.br/funds/knsc11'
    },
    {
        ticker: 'GARE11',
        name: 'Guardian Real Estate',
        segment: 'Híbrido',
        segmentFull: 'Renda Urbana / Logística',
        description: 'Foco em imóveis de renda urbana e galpões logísticos locados para grandes empresas em contratos atípicos.',
        fundsExplorerUrl: 'https://www.fundsexplorer.com.br/funds/gare11'
    },
    {
        ticker: 'BTCI11',
        name: 'BTG Pactual Crédito Imobiliário',
        segment: 'Papel',
        segmentFull: 'Papel / CRI',
        description: 'Fundo de papel gerido pelo BTG Pactual com foco em títulos de crédito imobiliário e gestão ativa.',
        fundsExplorerUrl: 'https://www.fundsexplorer.com.br/funds/btci11'
    },
    {
        ticker: 'MXRF11',
        name: 'Maxi Renda FII',
        segment: 'Papel',
        segmentFull: 'Papel / CRI',
        description: 'O maior FII da B3 em número de cotistas, focado em CRIs de alta liquidez e equilíbrio de risco.',
        fundsExplorerUrl: 'https://www.fundsexplorer.com.br/funds/mxrf11'
    }
];

// =========================================================
// 3. ESTADO GLOBAL & INSTÂNCIAS DE GRÁFICOS
// =========================================================

let equityChartInstance = null;
let portfolioSegmentChartInstance = null;
let portfolioIncomeChartInstance = null;
let carCategoryChartInstance = null;
let carComparisonChartInstance = null;
let vehicleCategoryChartInstance = null;
let vehicleTopExpensesChartInstance = null;

let simulationData = [];
let activeRadarFilter = 'all';
let activeCarCardsFilter = 'all';
let selectedCarForSpreadsheet = null;

// =========================================================
// 4. SISTEMA DE NAVEGAÇÃO
// =========================================================

function switchMainModule(targetModuleId) {
    document.querySelectorAll('.view-section').forEach(view => {
        view.classList.remove('active');
    });

    document.querySelectorAll('.main-nav-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-target') === targetModuleId) {
            btn.classList.add('active');
        }
    });

    const targetModule = document.getElementById(targetModuleId);
    if (targetModule) {
        targetModule.classList.add('active');
    }

    if (targetModuleId === 'fiiModule') {
        renderPortfolioView();
    } else if (targetModuleId === 'carModule') {
        // Activa a sub-aba salva ou a padrão
        const activeSub = document.querySelector('.car-subview.active');
        if (!activeSub) switchCarSubView('carSubCards');
        renderCarCardsListView();
    } else if (targetModuleId === 'cdbModule') {
        const activeSub = document.querySelector('.cdb-subview.active');
        if (!activeSub) switchCdbSubView('cdbSubPortfolio');
        renderCdbPortfolioView();
    }

    closeMobileSidebar();
}

function switchCarSubView(targetSubViewId) {
    document.querySelectorAll('.car-subview').forEach(sub => {
        sub.classList.remove('active');
    });

    document.querySelectorAll('.sub-nav-btn.car-sub-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-car-subtarget') === targetSubViewId) {
            btn.classList.add('active');
        }
    });

    const target = document.getElementById(targetSubViewId);
    if (target) target.classList.add('active');

    if (targetSubViewId === 'carSubCards') {
        renderCarCardsListView();
    } else if (targetSubViewId === 'carSubDashboard') {
        renderCarDashboard();
    }
}

function switchFiiSubView(targetSubViewId) {
    document.querySelectorAll('.fii-subview').forEach(sub => {
        sub.classList.remove('active');
    });

    document.querySelectorAll('.sub-nav-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-subtarget') === targetSubViewId) {
            btn.classList.add('active');
        }
    });

    const targetSubView = document.getElementById(targetSubViewId);
    if (targetSubView) {
        targetSubView.classList.add('active');
    }

    if (targetSubViewId === 'fiiSubPortfolio') {
        renderPortfolioView();
    } else if (targetSubViewId === 'fiiSubRadar') {
        renderRadarCards(activeRadarFilter, document.getElementById('radarSearchInput')?.value || '');
    }
}

function closeMobileSidebar() {
    const sidebar = document.getElementById('appSidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('open');
}

// =========================================================
// 5. AUTENTICAÇÃO & INTERFACE
// =========================================================

function updateAuthUI() {
    const container = document.getElementById('authBarContainer');
    const user = window.db.getCurrentUser();

    if (user) {
        const initial = (user.name || user.email).charAt(0).toUpperCase();
        container.innerHTML = `
            <div class="user-badge">
                <div class="user-avatar">${initial}</div>
                <div class="user-info-text">
                    <span class="user-name" title="${user.name}">${user.name}</span>
                    <span class="user-status">● Conectado</span>
                </div>
            </div>
            <button class="btn-auth-logout" id="btnLogoutBtn">
                <span>🚪</span> Sair da Conta
            </button>
        `;

        document.getElementById('btnLogoutBtn').addEventListener('click', () => {
            window.db.logout();
            showToast('Você saiu da sua conta.', 'info');
            updateAuthUI();
            renderPortfolioView();
            renderCarCardsListView();
            renderCdbPortfolioView();
        });
    } else {
        container.innerHTML = `
            <button class="btn-login-open" id="btnOpenAuthModal">
                <span>🔐</span> Entrar / Cadastrar
            </button>
        `;

        document.getElementById('btnOpenAuthModal').addEventListener('click', () => {
            openAuthModal('login');
        });
    }
}

function openAuthModal(mode = 'login') {
    const modal = document.getElementById('authModal');
    const tabLogin = document.getElementById('tabLoginSwitch');
    const tabRegister = document.getElementById('tabRegisterSwitch');
    const formLogin = document.getElementById('loginForm');
    const formRegister = document.getElementById('registerForm');

    if (mode === 'login') {
        tabLogin.classList.add('active');
        tabRegister.classList.remove('active');
        formLogin.style.display = 'block';
        formRegister.style.display = 'none';
    } else {
        tabRegister.classList.add('active');
        tabLogin.classList.remove('active');
        formRegister.style.display = 'block';
        formLogin.style.display = 'none';
    }

    modal.classList.add('open');
}

function closeAuthModal() {
    const modal = document.getElementById('authModal');
    modal.classList.remove('open');
    document.getElementById('loginForm').reset();
    document.getElementById('registerForm').reset();
}

// =========================================================
// 6. CALCULADORA DE FIIS (SIMULADOR)
// =========================================================

function calculateSimulation() {
    const sharePrice = parseFloat(document.getElementById('sharePrice').value);
    const lastDividend = parseFloat(document.getElementById('lastDividend').value);
    const monthlyInvestment = parseFloat(document.getElementById('monthlyInvestment').value);
    const durationInput = parseInt(document.getElementById('duration').value);
    const durationUnit = document.getElementById('durationUnit').value;
    const initialShares = parseInt(document.getElementById('initialShares').value) || 0;
    const reinvestDividends = document.getElementById('reinvestDividends').checked;

    if (isNaN(sharePrice) || isNaN(lastDividend) || isNaN(monthlyInvestment) || isNaN(durationInput)) {
        showToast('Preencha os campos da calculadora corretamente.', 'error');
        return;
    }

    const totalMonths = durationUnit === 'years' ? durationInput * 12 : durationInput;

    let currentShares = initialShares;
    let leftover = 0.0;
    let accumulatedInvested = 0.0;
    let accumulatedReinvested = 0.0;
    
    simulationData = [];

    const initialEquity = initialShares * sharePrice;

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

        simulationData.push({
            month: month,
            shares: currentShares,
            investedThisMonth: monthlyInvestment,
            reinvestmentThisMonth: monthlyReinvestedVal,
            dividendsThisMonth: dividendsReceived,
            totalInvestedCumulative: accumulatedInvested + initialEquity,
            equityCumulative: monthlyEquity
        });
    }

    const finalEquity = (currentShares * sharePrice) + leftover;
    const finalMonthDividends = currentShares * lastDividend;

    document.getElementById('initialEquityText').textContent = formatCurrency(initialEquity);
    document.getElementById('finalEquityText').textContent = formatCurrency(finalEquity);
    
    const durationLabel = durationInput === 1 
        ? (durationUnit === 'years' ? '1 Ano' : '1 Mês') 
        : `${durationInput} ${durationUnit === 'years' ? 'Anos' : 'Meses'}`;
    
    document.getElementById('resultDurationText').textContent = durationLabel;
    document.getElementById('resultTotalInvested').textContent = formatCurrency(accumulatedInvested);
    document.getElementById('resultTotalReinvested').textContent = formatCurrency(accumulatedReinvested);
    document.getElementById('resultFinalDividends').textContent = formatCurrency(finalMonthDividends);

    renderSimulationTable();
    renderSimulationChart(simulationData);
    document.getElementById('exportCsvBtn').style.display = 'inline-flex';
}

function renderSimulationTable() {
    const tableBody = document.getElementById('tableBody');
    tableBody.innerHTML = '';

    simulationData.forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${row.month}º</strong></td>
            <td>${formatNumber(row.shares)}</td>
            <td>${formatCurrency(row.investedThisMonth)}</td>
            <td>${formatCurrency(row.reinvestmentThisMonth)}</td>
            <td class="text-success">${formatCurrency(row.dividendsThisMonth)}</td>
        `;
        tableBody.appendChild(tr);
    });
}

function renderSimulationChart(data) {
    const ctx = document.getElementById('equityChart').getContext('2d');
    const labels = data.map(row => `${row.month}º Mês`);
    const equityValues = data.map(row => row.equityCumulative);
    const investedValues = data.map(row => row.totalInvestedCumulative);

    if (equityChartInstance) {
        equityChartInstance.destroy();
    }

    equityChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Patrimônio Total',
                    data: equityValues,
                    borderColor: '#A78BFA',
                    backgroundColor: 'rgba(167, 139, 250, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.3,
                    pointBackgroundColor: '#7C3AED',
                    pointBorderColor: '#FFF',
                    pointHoverRadius: 6
                },
                {
                    label: 'Total Aportado',
                    data: investedValues,
                    borderColor: '#4B5563',
                    borderDash: [5, 5],
                    borderWidth: 2,
                    fill: false,
                    tension: 0.1,
                    pointBackgroundColor: '#374151',
                    pointHoverRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        color: '#F3F4F6',
                        font: { family: 'Plus Jakarta Sans', weight: '600' }
                    }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: 'rgba(17, 16, 30, 0.95)',
                    titleColor: '#FFF',
                    bodyColor: '#D1D5DB',
                    borderColor: '#374151',
                    borderWidth: 1,
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) label += ': ';
                            if (context.parsed.y !== null) label += formatCurrency(context.parsed.y);
                            return label;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#9CA3AF', font: { family: 'Plus Jakarta Sans' } }
                },
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: {
                        color: '#9CA3AF',
                        font: { family: 'Plus Jakarta Sans' },
                        callback: (value) => formatCurrency(value)
                    }
                }
            }
        }
    });
}

function exportSimulationCSV() {
    if (!simulationData || simulationData.length === 0) return;

    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Mes,Cotas Acumuladas,Valor Investido (Mes),Valor Reinvestido (Mes),Dividendo Recebido (Mes),Patrimonio Acumulado\n";

    simulationData.forEach(row => {
        csvContent += `${row.month},${row.shares},${row.investedThisMonth},${row.reinvestmentThisMonth},${row.dividendsThisMonth},${row.equityCumulative.toFixed(2)}\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "simulacao_fiis.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// =========================================================
// 7. CARTEIRA DE FIIS
// =========================================================

function renderPortfolioView() {
    const user = window.db.getCurrentUser();
    const guestPrompt = document.getElementById('portfolioGuestPrompt');
    const content = document.getElementById('portfolioContent');

    if (!user) {
        guestPrompt.style.display = 'block';
        content.style.display = 'none';
        return;
    }

    guestPrompt.style.display = 'none';
    content.style.display = 'block';

    const investments = window.db.getUserInvestments(user.id);

    let totalInvested = 0;
    let totalMonthlyDividends = 0;
    let totalShares = 0;

    const segmentDistribution = {};
    const fiiIncomeData = [];

    investments.forEach(inv => {
        const itemInvested = inv.shares * inv.avgPrice;
        const itemMonthlyIncome = inv.shares * inv.lastDividend;

        totalInvested += itemInvested;
        totalMonthlyDividends += itemMonthlyIncome;
        totalShares += inv.shares;

        const seg = inv.segment || 'Outro';
        segmentDistribution[seg] = (segmentDistribution[seg] || 0) + itemInvested;

        fiiIncomeData.push({
            ticker: inv.ticker,
            income: itemMonthlyIncome
        });
    });

    const avgYield = totalInvested > 0 ? (totalMonthlyDividends / totalInvested) * 100 : 0;

    document.getElementById('portfolioTotalInvested').textContent = formatCurrency(totalInvested);
    document.getElementById('portfolioMonthlyDividends').textContent = formatCurrency(totalMonthlyDividends);
    document.getElementById('portfolioAvgYield').textContent = formatPercent(avgYield) + ' a.m.';
    document.getElementById('portfolioTotalShares').textContent = formatNumber(totalShares);

    renderPortfolioTable(investments);
    renderPortfolioCharts(segmentDistribution, fiiIncomeData);
}

function renderPortfolioTable(investments) {
    const tbody = document.getElementById('portfolioTableBody');
    tbody.innerHTML = '';

    if (!investments || investments.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" class="empty-state">
                    <span class="empty-state-icon">📂</span>
                    Nenhum FII cadastrado ainda. Clique em "<strong>+ Adicionar FII</strong>" acima para começar a montar sua carteira!
                </td>
            </tr>
        `;
        return;
    }

    investments.forEach(inv => {
        const totalInvested = inv.shares * inv.avgPrice;
        const monthlyIncome = inv.shares * inv.lastDividend;
        const yieldOnCost = inv.avgPrice > 0 ? (inv.lastDividend / inv.avgPrice) * 100 : 0;
        const badgeClass = getSegmentBadgeClass(inv.segment);

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <span class="ticker-badge">${inv.ticker}</span>
                ${inv.notes ? `<div style="font-size: 0.75rem; color: var(--text-muted);">${inv.notes}</div>` : ''}
            </td>
            <td><span class="segment-tag ${badgeClass}">${inv.segment}</span></td>
            <td><strong>${formatNumber(inv.shares)}</strong></td>
            <td>${formatCurrency(inv.avgPrice)}</td>
            <td><strong>${formatCurrency(totalInvested)}</strong></td>
            <td>${formatCurrency(inv.lastDividend)}</td>
            <td class="text-success"><strong>${formatCurrency(monthlyIncome)}</strong></td>
            <td><span class="text-accent">${formatPercent(yieldOnCost)}</span></td>
            <td style="text-align: right;">
                <div class="table-actions-cell" style="justify-content: flex-end;">
                    <button class="btn-table-action buy" title="Comprar mais cotas / Novo Aporte" data-action="buy" data-id="${inv.id}">
                        ➕ Aportar
                    </button>
                    <button class="btn-table-action simulate" title="Simular este FII na Calculadora" data-action="simulate" data-id="${inv.id}">
                        ⚡ Simular
                    </button>
                    <button class="btn-table-action" title="Editar FII" data-action="edit" data-id="${inv.id}">
                        ✏️
                    </button>
                    <button class="btn-table-action delete" title="Excluir da Carteira" data-action="delete" data-id="${inv.id}">
                        🗑️
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll('button[data-action]').forEach(btn => {
        btn.addEventListener('click', () => {
            const action = btn.getAttribute('data-action');
            const id = btn.getAttribute('data-id');
            const inv = investments.find(item => item.id === id);

            if (action === 'buy' && inv) {
                openBuySharesModal(inv);
            } else if (action === 'simulate' && inv) {
                simulateInvestment(inv);
            } else if (action === 'edit' && inv) {
                openEditInvestmentModal(inv);
            } else if (action === 'delete' && inv) {
                deleteInvestmentConfirm(inv);
            }
        });
    });
}

function renderPortfolioCharts(segmentData, fiiIncomeData) {
    const segmentCanvas = document.getElementById('portfolioSegmentChart');
    const incomeCanvas = document.getElementById('portfolioIncomeChart');

    if (!segmentCanvas || !incomeCanvas) return;

    const segmentLabels = Object.keys(segmentData);
    const segmentValues = Object.values(segmentData);

    if (portfolioSegmentChartInstance) {
        portfolioSegmentChartInstance.destroy();
    }

    if (segmentLabels.length === 0) {
        segmentLabels.push('Sem dados');
        segmentValues.push(1);
    }

    portfolioSegmentChartInstance = new Chart(segmentCanvas.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: segmentLabels,
            datasets: [{
                data: segmentValues,
                backgroundColor: [
                    '#7C3AED', '#3B82F6', '#10B981', '#F59E0B', 
                    '#EC4899', '#06B6D4', '#8B5CF6', '#64748B'
                ],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: { color: '#F3F4F6', font: { family: 'Plus Jakarta Sans', size: 11 } }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.label}: ${formatCurrency(context.parsed)}`;
                        }
                    }
                }
            },
            cutout: '68%'
        }
    });

    fiiIncomeData.sort((a, b) => b.income - a.income);
    const fiiLabels = fiiIncomeData.map(i => i.ticker);
    const fiiValues = fiiIncomeData.map(i => i.income);

    if (portfolioIncomeChartInstance) {
        portfolioIncomeChartInstance.destroy();
    }

    portfolioIncomeChartInstance = new Chart(incomeCanvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: fiiLabels.length ? fiiLabels : ['Sem dados'],
            datasets: [{
                label: 'Renda Mensal (R$)',
                data: fiiValues.length ? fiiValues : [0],
                backgroundColor: 'rgba(16, 185, 129, 0.75)',
                borderColor: '#10B981',
                borderWidth: 1,
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (c) => `Renda: ${formatCurrency(c.parsed.y)}`
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: '#9CA3AF', font: { family: 'Plus Jakarta Sans' } }
                },
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: {
                        color: '#9CA3AF',
                        font: { family: 'Plus Jakarta Sans' },
                        callback: (v) => formatCurrency(v)
                    }
                }
            }
        }
    });
}

function simulateInvestment(inv) {
    document.getElementById('sharePrice').value = inv.avgPrice ? inv.avgPrice.toFixed(2) : '';
    document.getElementById('lastDividend').value = inv.lastDividend ? inv.lastDividend.toFixed(2) : '';
    document.getElementById('initialShares').value = inv.shares || '100';
    
    const currentMonthly = parseFloat(document.getElementById('monthlyInvestment').value);
    if (isNaN(currentMonthly) || currentMonthly <= 0) {
        document.getElementById('monthlyInvestment').value = inv.avgPrice ? Math.round(inv.avgPrice * 10) : '500';
    }

    if (!document.getElementById('duration').value) {
        document.getElementById('duration').value = '5';
    }

    switchFiiSubView('fiiSubCalculator');
    calculateSimulation();
    showToast(`Parâmetros de ${inv.ticker} carregados na Calculadora!`, 'success');
}

function openAddInvestmentModal(prefillData = null) {
    const user = window.db.getCurrentUser();
    if (!user) {
        openAuthModal('login');
        showToast('Faça login primeiro para cadastrar investimentos.', 'info');
        return;
    }

    document.getElementById('invEditId').value = '';
    document.getElementById('investmentModalTitle').textContent = 'Adicionar FII à Carteira';
    document.getElementById('investmentForm').reset();

    if (prefillData) {
        document.getElementById('invTicker').value = prefillData.ticker || '';
        document.getElementById('invSegment').value = prefillData.segment || 'Outro';
        document.getElementById('invShares').value = prefillData.shares || '';
        document.getElementById('invAvgPrice').value = prefillData.avgPrice || '';
        document.getElementById('invLastDividend').value = prefillData.lastDividend || '';
    }

    document.getElementById('investmentModal').classList.add('open');
}

function openEditInvestmentModal(inv) {
    document.getElementById('invEditId').value = inv.id;
    document.getElementById('investmentModalTitle').textContent = `Editar ${inv.ticker}`;
    document.getElementById('invTicker').value = inv.ticker;
    document.getElementById('invSegment').value = inv.segment || 'Outro';
    document.getElementById('invShares').value = inv.shares;
    document.getElementById('invAvgPrice').value = inv.avgPrice;
    document.getElementById('invLastDividend').value = inv.lastDividend;
    document.getElementById('invNotes').value = inv.notes || '';
    document.getElementById('investmentModal').classList.add('open');
}

function closeInvestmentModal() {
    document.getElementById('investmentModal').classList.remove('open');
    document.getElementById('investmentForm').reset();
}

let currentBuyInvestment = null;

function openBuySharesModal(inv) {
    currentBuyInvestment = inv;
    document.getElementById('buyInvestmentId').value = inv.id;
    document.getElementById('buyModalTitle').textContent = `Comprar Mais Cotas de ${inv.ticker}`;
    document.getElementById('buyCurrentShares').textContent = formatNumber(inv.shares);
    document.getElementById('buyCurrentAvgPrice').textContent = formatCurrency(inv.avgPrice);
    document.getElementById('buyCurrentDividend').textContent = formatCurrency(inv.lastDividend);

    document.getElementById('buyNewShares').value = '10';
    document.getElementById('buyPrice').value = inv.avgPrice.toFixed(2);
    document.getElementById('buyDividend').value = inv.lastDividend.toFixed(2);

    updateBuyPreview();
    document.getElementById('buySharesModal').classList.add('open');
}

function closeBuySharesModal() {
    document.getElementById('buySharesModal').classList.remove('open');
    document.getElementById('buySharesForm').reset();
    currentBuyInvestment = null;
}

function updateBuyPreview() {
    if (!currentBuyInvestment) return;

    const currentShares = parseInt(currentBuyInvestment.shares) || 0;
    const currentAvgPrice = parseFloat(currentBuyInvestment.avgPrice) || 0;

    const addShares = parseInt(document.getElementById('buyNewShares').value) || 0;
    const price = parseFloat(document.getElementById('buyPrice').value) || 0;
    const div = parseFloat(document.getElementById('buyDividend').value);

    const effectiveDiv = (!isNaN(div) && div >= 0) ? div : currentBuyInvestment.lastDividend;

    const currentCost = currentShares * currentAvgPrice;
    const aporteCost = addShares * price;
    const newTotalShares = currentShares + addShares;

    const newAvgPrice = newTotalShares > 0 ? (currentCost + aporteCost) / newTotalShares : 0;
    const newMonthlyIncome = newTotalShares * effectiveDiv;

    document.getElementById('previewTotalShares').textContent = `${formatNumber(newTotalShares)} cotas (+${addShares})`;
    document.getElementById('previewAporteCost').textContent = formatCurrency(aporteCost);
    document.getElementById('previewNewAvgPrice').textContent = formatCurrency(newAvgPrice);
    document.getElementById('previewNewMonthlyIncome').textContent = `${formatCurrency(newMonthlyIncome)} / mês`;
}

function deleteInvestmentConfirm(inv) {
    if (confirm(`Tem certeza que deseja remover ${inv.ticker} da sua carteira?`)) {
        try {
            window.db.deleteInvestment(inv.id);
            showToast(`${inv.ticker} removido com sucesso.`, 'info');
            renderPortfolioView();
        } catch (e) {
            showToast(e.message, 'error');
        }
    }
}

function exportPortfolioCSV() {
    const user = window.db.getCurrentUser();
    if (!user) return;

    const investments = window.db.getUserInvestments(user.id);
    if (!investments.length) {
        showToast('Nenhum FII para exportar.', 'info');
        return;
    }

    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Ticker,Segmento,Quantidade Cotas,Preco Medio,Total Investido,Ultimo Dividendo Cota,Renda Mensal,Yield on Cost %,Anotacoes\n";

    investments.forEach(inv => {
        const total = inv.shares * inv.avgPrice;
        const income = inv.shares * inv.lastDividend;
        const yoc = inv.avgPrice > 0 ? (inv.lastDividend / inv.avgPrice) * 100 : 0;
        csvContent += `"${inv.ticker}","${inv.segment}",${inv.shares},${inv.avgPrice.toFixed(2)},${total.toFixed(2)},${inv.lastDividend.toFixed(2)},${income.toFixed(2)},${yoc.toFixed(2)}%,"${(inv.notes || '').replace(/"/g, '""')}"\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `carteira_fiis_${user.name.toLowerCase().replace(/\s+/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// =========================================================
// 8. RADAR FUNDS EXPLORER (5 FIIS)
// =========================================================

function renderRadarCards(filterSegment = 'all', searchQuery = '') {
    const container = document.getElementById('radarCardsGrid');
    if (!container) return;

    const cleanQuery = (searchQuery || '').trim().toLowerCase();

    const filtered = RADAR_FIIS_DATA.filter(fii => {
        const matchesSegment = filterSegment === 'all' || fii.segment.toLowerCase().includes(filterSegment.toLowerCase());
        const matchesSearch = cleanQuery === '' || 
            fii.ticker.toLowerCase().includes(cleanQuery) || 
            fii.name.toLowerCase().includes(cleanQuery) ||
            fii.description.toLowerCase().includes(cleanQuery);
        return matchesSegment && matchesSearch;
    });

    if (filtered.length === 0) {
        container.innerHTML = `
            <div style="grid-column: 1 / -1;" class="empty-state">
                <span class="empty-state-icon">🔍</span>
                Nenhum FII encontrado com os filtros selecionados.
            </div>
        `;
        return;
    }

    container.innerHTML = '';
    filtered.forEach(fii => {
        const badgeClass = getSegmentBadgeClass(fii.segment);
        const card = document.createElement('div');
        card.className = 'fii-radar-card';
        card.innerHTML = `
            <div class="fii-card-header">
                <div class="fii-card-title-group">
                    <span class="fii-card-ticker">${fii.ticker}</span>
                    <span class="fii-card-name">${fii.name}</span>
                </div>
                <span class="segment-tag ${badgeClass}">${fii.segmentFull}</span>
            </div>

            <p class="fii-card-desc">${fii.description}</p>

            <div class="fii-card-actions">
                <a href="${fii.fundsExplorerUrl}" target="_blank" rel="noopener noreferrer" class="btn-fe-link">
                    <span>🌐</span> Acessar no Funds Explorer ↗
                </a>

                <div class="fii-card-subactions">
                    <button class="btn-card-subaction sim" data-radar-action="simulate" data-ticker="${fii.ticker}">
                        ⚡ Simular
                    </button>
                    <button class="btn-card-subaction" data-radar-action="add" data-ticker="${fii.ticker}">
                        ➕ Carteira
                    </button>
                </div>
            </div>
        `;
        container.appendChild(card);
    });

    container.querySelectorAll('button[data-radar-action]').forEach(btn => {
        btn.addEventListener('click', () => {
            const action = btn.getAttribute('data-radar-action');
            const ticker = btn.getAttribute('data-ticker');
            const fii = RADAR_FIIS_DATA.find(f => f.ticker === ticker);

            if (action === 'simulate' && fii) {
                switchFiiSubView('fiiSubCalculator');
                document.getElementById('sharePrice').focus();
                showToast(`Simulador pronto para o ${fii.ticker}! Insira os valores desejados.`, 'info');
            } else if (action === 'add' && fii) {
                openAddInvestmentModal({
                    ticker: fii.ticker,
                    segment: fii.segmentFull,
                    shares: '',
                    avgPrice: '',
                    lastDividend: ''
                });
            }
        });
    });
}

// =========================================================
// 9. MÓDULO DE CARROS DE LEILÃO (CARDS & PLANILHA ESTILO EXCEL)
// =========================================================

function renderCarCardsListView() {
    const user = window.db.getCurrentUser();
    const guestPrompt = document.getElementById('carGuestPrompt');
    const content = document.getElementById('carContent');

    if (!user) {
        guestPrompt.style.display = 'block';
        content.style.display = 'none';
        return;
    }

    guestPrompt.style.display = 'none';
    content.style.display = 'block';

    // Garante que a visualização de cards está ativa e a planilha oculta
    document.getElementById('carCardsListView').style.display = 'block';
    document.getElementById('carSpreadsheetView').classList.remove('active');

    const cars = window.db.getUserCars(user.id);
    const container = document.getElementById('carCardsGrid');
    const searchQuery = (document.getElementById('carCardsSearchInput')?.value || '').trim().toLowerCase();

    const filtered = cars.filter(car => {
        const matchesStatus = activeCarCardsFilter === 'all' || car.status === activeCarCardsFilter;
        const matchesSearch = searchQuery === '' ||
            car.model.toLowerCase().includes(searchQuery) ||
            (car.plate && car.plate.toLowerCase().includes(searchQuery)) ||
            (car.auctioneer && car.auctioneer.toLowerCase().includes(searchQuery));
        return matchesStatus && matchesSearch;
    });

    if (filtered.length === 0) {
        container.innerHTML = `
            <div style="grid-column: 1 / -1;" class="empty-state">
                <span class="empty-state-icon">🚗</span>
                Nenhum carro cadastrado. Clique em "<strong>+ Adicionar Novo Carro</strong>" acima para registrar seu primeiro veículo!
            </div>
        `;
        return;
    }

    container.innerHTML = '';
    filtered.forEach(car => {
        const expenses = car.expenses || [];
        const totalExpenses = expenses.reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);
        const bidAmount = parseFloat(car.bidAmount) || 0;
        const totalCost = bidAmount + totalExpenses;
        const statusBadgeClass = getCarStatusBadgeClass(car.status);

        let resultSummaryHtml = '';
        if (car.status === 'Vendido') {
            const profit = (car.salePrice || 0) - totalCost;
            const margin = totalCost > 0 ? (profit / totalCost) * 100 : 0;
            resultSummaryHtml = `
                <div class="car-summary-row">
                    <span>Venda Realizada:</span>
                    <span class="val text-success">${formatCurrency(car.salePrice)}</span>
                </div>
                <div class="car-summary-row">
                    <span>Lucro Líquido:</span>
                    <span class="val text-success">${formatCurrency(profit)} (${formatPercent(margin)})</span>
                </div>
            `;
        } else if (car.salePrice > 0) {
            resultSummaryHtml = `
                <div class="car-summary-row">
                    <span>Preço Anunciado:</span>
                    <span class="val text-amber">${formatCurrency(car.salePrice)}</span>
                </div>
            `;
        }

        const card = document.createElement('div');
        card.className = 'car-purchase-card';
        card.innerHTML = `
            <div>
                <div class="car-card-top">
                    <div class="car-title-wrapper">
                        <div class="car-model-name">${car.model}</div>
                        <div class="car-plate-badge">
                            <span>${car.year || ''}</span>
                            ${car.plate ? `<span class="car-plate-tag">${car.plate}</span>` : ''}
                        </div>
                    </div>
                    <span class="segment-tag ${statusBadgeClass}">${car.status}</span>
                </div>

                <div style="margin: 0.85rem 0; font-size: 0.85rem; color: var(--text-muted);">
                    🏢 ${car.auctioneer ? `Leiloeiro: ${car.auctioneer}` : 'Leilão'} • 📅 ${formatDateBR(car.purchaseDate)}
                </div>

                <div class="car-financial-summary">
                    <div class="car-summary-row">
                        <span>Lance de Arrematação:</span>
                        <span class="val">${formatCurrency(bidAmount)}</span>
                    </div>
                    <div class="car-summary-row">
                        <span>Gastos na Planilha:</span>
                        <span class="val text-amber">${formatCurrency(totalExpenses)} <span style="font-size:0.75rem; color:var(--text-muted);">(${expenses.length} itens)</span></span>
                    </div>
                    <div class="car-summary-row">
                        <span>Custo Total do Carro:</span>
                        <span class="val total">${formatCurrency(totalCost)}</span>
                    </div>
                    ${resultSummaryHtml}
                </div>
            </div>

            <div>
                <button class="btn-open-spreadsheet" data-car-id="${car.id}">
                    <span>📊</span> Abrir Planilha de Gastos & Serviços
                </button>
                <div class="car-card-footer-actions" style="margin-top: 0.75rem;">
                    <button class="btn-table-action" data-edit-car="${car.id}" title="Editar Dados Básicos">
                        ✏️ Editar Carro
                    </button>
                    <button class="btn-table-action delete" data-delete-car="${car.id}" title="Excluir Carro">
                        🗑️ Excluir
                    </button>
                </div>
            </div>
        `;

        container.appendChild(card);
    });

    // Eventos dos botões nos cards
    container.querySelectorAll('.btn-open-spreadsheet').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const carId = btn.getAttribute('data-car-id');
            openCarSpreadsheet(carId);
        });
    });

    container.querySelectorAll('.car-purchase-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (e.target.closest('button')) return;
            const btn = card.querySelector('.btn-open-spreadsheet');
            if (btn) {
                const carId = btn.getAttribute('data-car-id');
                openCarSpreadsheet(carId);
            }
        });
    });

    container.querySelectorAll('button[data-edit-car]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const carId = btn.getAttribute('data-edit-car');
            const car = window.db.getCarById(carId);
            if (car) openEditCarModal(car);
        });
    });

    container.querySelectorAll('button[data-delete-car]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const carId = btn.getAttribute('data-delete-car');
            const car = window.db.getCarById(carId);
            if (car) deleteCarConfirm(car);
        });
    });
}

// =========================================================
// 10. PLANILHA ESTILO EXCEL PARA GASTOS DO CARRO
// =========================================================

function openCarSpreadsheet(carId) {
    const car = window.db.getCarById(carId);
    if (!car) {
        showToast('Veículo não encontrado.', 'error');
        return;
    }

    selectedCarForSpreadsheet = car;

    // Alterna visualizações
    document.getElementById('carCardsListView').style.display = 'none';
    const sheetView = document.getElementById('carSpreadsheetView');
    sheetView.classList.add('active');

    // Preenche cabeçalho e KPIs
    updateCarSpreadsheetHeader();

    // Renderiza a tabela de gastos
    renderCarExpensesTable();

    // Renderiza o dashboard específico do veículo
    renderCarVehicleDashboard();

    // Limpa formulário de adicionar despesa e define a data de hoje
    const addForm = document.getElementById('addExpenseForm');
    addForm.reset();
    document.getElementById('expDate').value = new Date().toISOString().split('T')[0];

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateCarSpreadsheetHeader() {
    if (!selectedCarForSpreadsheet) return;
    const car = selectedCarForSpreadsheet;

    const expenses = car.expenses || [];
    const totalExpenses = expenses.reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);
    const bidAmount = parseFloat(car.bidAmount) || 0;
    const totalCost = bidAmount + totalExpenses;

    document.getElementById('sheetCarModel').textContent = car.model;
    
    const badge = document.getElementById('sheetCarStatusBadge');
    badge.textContent = car.status;
    badge.className = `segment-tag ${getCarStatusBadgeClass(car.status)}`;

    document.getElementById('sheetCarYear').textContent = `Ano: ${car.year || '--'}`;
    document.getElementById('sheetCarPlate').textContent = car.plate ? `Placa: ${car.plate}` : 'Sem placa';
    document.getElementById('sheetCarAuctioneer').textContent = `Leiloeiro: ${car.auctioneer || 'Leilão'}`;
    document.getElementById('sheetCarPurchaseDate').textContent = `Compra: ${formatDateBR(car.purchaseDate)}`;

    // KPIs
    document.getElementById('sheetKpiBid').textContent = formatCurrency(bidAmount);
    document.getElementById('sheetKpiExpenses').textContent = formatCurrency(totalExpenses);
    document.getElementById('sheetKpiTotalCost').textContent = formatCurrency(totalCost);

    const resultLbl = document.getElementById('sheetKpiResultLabel');
    const resultVal = document.getElementById('sheetKpiResultValue');

    if (car.status === 'Vendido') {
        const profit = (car.salePrice || 0) - totalCost;
        resultLbl.textContent = 'Lucro Líquido Realizado';
        resultVal.textContent = formatCurrency(profit);
        resultVal.className = `val ${profit >= 0 ? 'text-success' : 'text-danger'}`;
    } else if (car.salePrice > 0) {
        const estProfit = car.salePrice - totalCost;
        resultLbl.textContent = 'Lucro Estimado (Anúncio)';
        resultVal.textContent = formatCurrency(estProfit);
        resultVal.className = 'val text-amber';
    } else {
        resultLbl.textContent = 'Preço de Venda';
        resultVal.textContent = 'Não definido';
        resultVal.className = 'val';
    }
}

function renderCarExpensesTable() {
    if (!selectedCarForSpreadsheet) return;
    const expenses = selectedCarForSpreadsheet.expenses || [];
    const tbody = document.getElementById('carExpensesTableBody');
    tbody.innerHTML = '';

    if (expenses.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="empty-state" style="padding: 2rem;">
                    <span class="empty-state-icon" style="font-size: 2rem;">📋</span>
                    Nenhum gasto ou serviço lançado para este veículo.<br>
                    Use a barra acima para lançar <strong>comissão do leilão, guincho, mecânica, funilaria, peças ou documentação</strong>!
                </td>
            </tr>
        `;
        document.getElementById('sheetTableTotalExpenses').textContent = formatCurrency(0);
        return;
    }

    let total = 0;

    expenses.forEach((exp, index) => {
        const amount = parseFloat(exp.amount) || 0;
        total += amount;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${index + 1}</strong></td>
            <td>${formatDateBR(exp.date)}</td>
            <td><span class="segment-tag badge-shopping">${exp.category || 'Serviço'}</span></td>
            <td><strong>${exp.description || '--'}</strong></td>
            <td>${exp.supplier || '--'}</td>
            <td style="text-align: right; font-weight: 700; color: #FFF;">${formatCurrency(amount)}</td>
            <td style="text-align: center;">
                <button class="btn-table-action delete" style="padding: 0.25rem 0.5rem;" data-exp-id="${exp.id}" title="Remover gasto">
                    🗑️
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    document.getElementById('sheetTableTotalExpenses').textContent = formatCurrency(total);

    // Eventos de exclusão de despesa
    tbody.querySelectorAll('button[data-exp-id]').forEach(btn => {
        btn.addEventListener('click', () => {
            const expId = btn.getAttribute('data-exp-id');
            deleteExpense(expId);
        });
    });
}

function deleteExpense(expId) {
    if (!selectedCarForSpreadsheet) return;
    try {
        const updatedCar = window.db.deleteCarExpense(selectedCarForSpreadsheet.id, expId);
        selectedCarForSpreadsheet = updatedCar;
        updateCarSpreadsheetHeader();
        renderCarExpensesTable();
        renderCarVehicleDashboard();
        showToast('Gasto removido da planilha.', 'info');
    } catch (e) {
        showToast(e.message, 'error');
    }
}

function exportCurrentCarCSV() {
    if (!selectedCarForSpreadsheet) return;
    const car = selectedCarForSpreadsheet;
    const expenses = car.expenses || [];

    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += `Planilha de Gastos - ${car.model} (${car.plate || ''})\n`;
    csvContent += `Lance Arrematacao: R$ ${car.bidAmount.toFixed(2)}\n\n`;
    csvContent += "Item,Data,Categoria,Descricao do Servico/Peca,Oficina/Fornecedor,Valor (R$)\n";

    expenses.forEach((exp, idx) => {
        csvContent += `${idx + 1},"${exp.date}","${exp.category}","${(exp.description || '').replace(/"/g, '""')}","${(exp.supplier || '').replace(/"/g, '""')}",${(parseFloat(exp.amount) || 0).toFixed(2)}\n`;
    });

    const totalExp = expenses.reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);
    const totalCost = car.bidAmount + totalExp;

    csvContent += `\nTotal em Gastos: R$ ${totalExp.toFixed(2)}\n`;
    csvContent += `CUSTO TOTAL DO VEICULO: R$ ${totalCost.toFixed(2)}\n`;
    if (car.status === 'Vendido') {
        csvContent += `Valor de Venda: R$ ${car.salePrice.toFixed(2)}\n`;
        csvContent += `LUCRO LIQUIDO REALIZADO: R$ ${(car.salePrice - totalCost).toFixed(2)}\n`;
    }

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `planilha_${car.model.toLowerCase().replace(/\s+/g, '_')}_${car.plate || 'leilao'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Modais de Carro
function openAddCarModal() {
    const user = window.db.getCurrentUser();
    if (!user) {
        openAuthModal('login');
        showToast('Faça login primeiro para cadastrar carros de leilão.', 'info');
        return;
    }

    document.getElementById('carEditId').value = '';
    document.getElementById('carModalTitle').textContent = 'Cadastrar Novo Carro Comprado';
    document.getElementById('carForm').reset();
    document.getElementById('carPurchaseDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('carModal').classList.add('open');
}

function openEditCarModal(car) {
    document.getElementById('carEditId').value = car.id;
    document.getElementById('carModalTitle').textContent = `Editar ${car.model}`;
    document.getElementById('carModel').value = car.model;
    document.getElementById('carYear').value = car.year;
    document.getElementById('carPlate').value = car.plate || '';
    document.getElementById('carAuctioneer').value = car.auctioneer || '';
    document.getElementById('carPurchaseDate').value = car.purchaseDate || '';
    document.getElementById('carBid').value = car.bidAmount || '';
    document.getElementById('carFipe').value = car.fipeValue || '';
    document.getElementById('carStatus').value = car.status || 'Em Reforma';
    document.getElementById('carNotes').value = car.notes || '';
    document.getElementById('carModal').classList.add('open');
}

function closeCarModal() {
    document.getElementById('carModal').classList.remove('open');
    document.getElementById('carForm').reset();
}

function openCarSaleStatusModal() {
    if (!selectedCarForSpreadsheet) return;
    const car = selectedCarForSpreadsheet;

    const expenses = car.expenses || [];
    const totalExpenses = expenses.reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);
    const bidAmount = parseFloat(car.bidAmount) || 0;
    const totalCost = bidAmount + totalExpenses;

    document.getElementById('saleCarId').value = car.id;
    document.getElementById('carSaleModalTitle').textContent = `Registrar Venda — ${car.model}`;
    document.getElementById('saleModalBid').textContent = formatCurrency(bidAmount);
    document.getElementById('saleModalExpenses').textContent = formatCurrency(totalExpenses);
    document.getElementById('saleModalTotalCost').textContent = formatCurrency(totalCost);
    document.getElementById('modalCarStatusSelect').value = 'Vendido';
    document.getElementById('modalSalePrice').value = car.salePrice ? car.salePrice : '';
    document.getElementById('modalSaleDate').value = car.saleDate || new Date().toISOString().split('T')[0];

    // Preencher preview de lucro se já há preço
    updateSaleModalPreview(totalCost);

    document.getElementById('carSaleModal').classList.add('open');

    // Listener do input de preço para preview em tempo real
    const priceInput = document.getElementById('modalSalePrice');
    priceInput.oninput = () => updateSaleModalPreview(totalCost);
}

function updateSaleModalPreview(totalCost) {
    const salePrice = parseFloat(document.getElementById('modalSalePrice').value) || 0;
    const profit = salePrice - totalCost;
    const margin = totalCost > 0 ? (profit / totalCost) * 100 : 0;

    const profitEl = document.getElementById('previewSaleProfit');
    const marginEl = document.getElementById('previewSaleMargin');

    profitEl.textContent = formatCurrency(profit);
    marginEl.textContent = formatPercent(margin);

    const colorClass = profit >= 0 ? 'text-success' : 'text-danger';
    profitEl.className = `val ${colorClass}`;
    marginEl.className = `val ${colorClass}`;
}

function closeCarSaleModal() {
    document.getElementById('carSaleModal').classList.remove('open');
    const priceInput = document.getElementById('modalSalePrice');
    if (priceInput) priceInput.oninput = null;
}

function deleteCarConfirm(car) {
    if (confirm(`Tem certeza que deseja remover o veículo ${car.model} (${car.plate || ''}) e toda a sua planilha de gastos?`)) {
        try {
            window.db.deleteCar(car.id);
            showToast(`${car.model} removido com sucesso.`, 'info');
            renderCarCardsListView();
        } catch (e) {
            showToast(e.message, 'error');
        }
    }
}

// =========================================================
// 10b. DASHBOARD PERSONALIZADO DO VEÍCULO (por planilha)
// =========================================================

function renderCarVehicleDashboard() {
    const car = selectedCarForSpreadsheet;
    if (!car) return;

    const expenses = car.expenses || [];
    const bidAmount = parseFloat(car.bidAmount) || 0;
    const totalExpenses = expenses.reduce((acc, e) => acc + (parseFloat(e.amount) || 0), 0);
    const totalCost = bidAmount + totalExpenses;
    const salePrice = parseFloat(car.salePrice) || 0;
    const isSold = car.status === 'Vendido';
    const profit = isSold ? salePrice - totalCost : null;
    const margin = (isSold && totalCost > 0) ? (profit / totalCost) * 100 : null;

    // ---- KPI cards do veículo ----
    const kpiContainer = document.getElementById('vehicleDashKpis');
    if (kpiContainer) {
        const marginPercent = margin !== null ? formatPercent(margin) : '--';
        const profitStr = profit !== null ? formatCurrency(profit) : 'N/A';
        const profitColor = profit !== null ? (profit >= 0 ? '#10B981' : '#EF4444') : 'var(--text-muted)';
        const coveragePct = totalCost > 0 ? (totalExpenses / totalCost) * 100 : 0;

        kpiContainer.innerHTML = `
            <div class="portfolio-stat-card">
                <div class="stat-icon-wrapper stat-icon-orange"><span>💸</span></div>
                <div class="stat-content">
                    <span class="stat-label">Lance (Arrematação)</span>
                    <span class="stat-value">${formatCurrency(bidAmount)}</span>
                </div>
            </div>
            <div class="portfolio-stat-card">
                <div class="stat-icon-wrapper stat-icon-amber"><span>💳</span></div>
                <div class="stat-content">
                    <span class="stat-label">Gastos na Planilha (${expenses.length} itens)</span>
                    <span class="stat-value text-amber">${formatCurrency(totalExpenses)}</span>
                </div>
            </div>
            <div class="portfolio-stat-card">
                <div class="stat-icon-wrapper stat-icon-cyan"><span>🎯</span></div>
                <div class="stat-content">
                    <span class="stat-label">Custo Total do Carro</span>
                    <span class="stat-value">${formatCurrency(totalCost)}</span>
                    <span style="font-size:0.75rem;color:var(--text-muted);">${formatPercent(coveragePct)} em gastos extras</span>
                </div>
            </div>
            <div class="portfolio-stat-card">
                <div class="stat-icon-wrapper stat-icon-${profit !== null && profit >= 0 ? 'green' : 'orange'}"><span>${isSold ? '💵' : '🕒'}</span></div>
                <div class="stat-content">
                    <span class="stat-label">${isSold ? 'Lucro Líquido Realizado' : 'Preço / Lucro Estimado'}</span>
                    <span class="stat-value" style="color:${profitColor}">${profit !== null ? profitStr : (salePrice > 0 ? formatCurrency(salePrice - totalCost) : 'Sem preço')}</span>
                    ${margin !== null ? `<span style="font-size:0.78rem;color:${profitColor}">${marginPercent} de margem</span>` : ''}
                </div>
            </div>
        `;
    }

    // ---- Gráfico 1: Gastos por Categoria (Doughnut) ----
    const catCanvas = document.getElementById('vehicleCategoryChart');
    if (catCanvas) {
        if (vehicleCategoryChartInstance) vehicleCategoryChartInstance.destroy();

        const catMap = {};
        // Inclui o lance como categoria
        if (bidAmount > 0) catMap['Lance / Arrematação'] = bidAmount;
        expenses.forEach(e => {
            const cat = e.category || 'Outro';
            catMap[cat] = (catMap[cat] || 0) + (parseFloat(e.amount) || 0);
        });

        const catLabels = Object.keys(catMap);
        const catValues = Object.values(catMap);

        vehicleCategoryChartInstance = new Chart(catCanvas.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: catLabels.length ? catLabels : ['Sem gastos'],
                datasets: [{
                    data: catValues.length ? catValues : [1],
                    backgroundColor: [
                        '#EA580C','#F59E0B','#EF4444','#10B981',
                        '#3B82F6','#8B5CF6','#EC4899','#06B6D4','#64748B'
                    ],
                    borderWidth: 0,
                    hoverOffset: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '62%',
                plugins: {
                    legend: {
                        position: 'right',
                        labels: { color: '#F3F4F6', font: { family: 'Plus Jakarta Sans', size: 11 }, padding: 12 }
                    },
                    tooltip: {
                        callbacks: {
                            label: (c) => `${c.label}: ${formatCurrency(c.parsed)} (${formatPercent(totalCost > 0 ? (c.parsed / totalCost) * 100 : 0)})`
                        }
                    }
                }
            }
        });
    }

    // ---- Gráfico 2: Top 8 Maiores Gastos individuais (Bar horizontal) ----
    const topCanvas = document.getElementById('vehicleTopExpensesChart');
    if (topCanvas) {
        if (vehicleTopExpensesChartInstance) vehicleTopExpensesChartInstance.destroy();

        const sorted = [...expenses]
            .sort((a, b) => (parseFloat(b.amount) || 0) - (parseFloat(a.amount) || 0))
            .slice(0, 8);

        const topLabels = sorted.map(e => {
            const desc = (e.description || e.category || 'Gasto').substring(0, 22);
            return desc.length < (e.description || '').length ? desc + '…' : desc;
        });
        const topValues = sorted.map(e => parseFloat(e.amount) || 0);

        vehicleTopExpensesChartInstance = new Chart(topCanvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels: topLabels.length ? topLabels : ['Sem gastos'],
                datasets: [{
                    label: 'Valor (R$)',
                    data: topValues.length ? topValues : [0],
                    backgroundColor: 'rgba(245, 158, 11, 0.75)',
                    borderColor: '#F59E0B',
                    borderWidth: 1,
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y',
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: { label: (c) => formatCurrency(c.parsed.x) }
                    }
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: {
                            color: '#9CA3AF',
                            font: { family: 'Plus Jakarta Sans' },
                            callback: (v) => formatCurrency(v)
                        }
                    },
                    y: {
                        grid: { display: false },
                        ticks: { color: '#D1D5DB', font: { family: 'Plus Jakarta Sans', size: 11 } }
                    }
                }
            }
        });
    }
}

// =========================================================
// 11. DASHBOARD FINANCEIRO GERAL DE CARROS
// =========================================================

function renderCarDashboard() {
    const user = window.db.getCurrentUser();
    if (!user) return;

    const cars = window.db.getUserCars(user.id);

    let totalSpent = 0;
    let totalRevenue = 0;
    let totalProfit = 0;
    let soldCount = 0;

    // Acumuladores por categoria e por carro
    const categoryMap = {};
    const tableRows = [];
    const carLabels = [];
    const carCostValues = [];
    const carSaleValues = [];

    cars.forEach(car => {
        const expenses = car.expenses || [];
        const totalExpenses = expenses.reduce((acc, e) => acc + (parseFloat(e.amount) || 0), 0);
        const bidAmount = parseFloat(car.bidAmount) || 0;
        const totalCost = bidAmount + totalExpenses;
        const salePrice = parseFloat(car.salePrice) || 0;
        const profit = car.status === 'Vendido' ? salePrice - totalCost : 0;
        const margin = (car.status === 'Vendido' && totalCost > 0) ? (profit / totalCost) * 100 : null;

        totalSpent += totalCost;

        if (car.status === 'Vendido') {
            totalRevenue += salePrice;
            totalProfit += profit;
            soldCount++;
        }

        // Agrupa gastos por categoria
        expenses.forEach(exp => {
            const cat = exp.category || 'Outro';
            categoryMap[cat] = (categoryMap[cat] || 0) + (parseFloat(exp.amount) || 0);
        });
        // Inclui o lance como categoria própria
        if (bidAmount > 0) {
            categoryMap['Lance / Arrematação'] = (categoryMap['Lance / Arrematação'] || 0) + bidAmount;
        }

        // Dados para o gráfico de barras por veículo
        const shortLabel = car.model.length > 16 ? car.model.substring(0, 14) + '…' : car.model;
        carLabels.push(shortLabel + (car.plate ? ` (${car.plate})` : ''));
        carCostValues.push(totalCost);
        carSaleValues.push(salePrice > 0 ? salePrice : null);

        tableRows.push({ car, totalExpenses, totalCost, salePrice, profit, margin });
    });

    const avgMargin = soldCount > 0 ? (tableRows.filter(r => r.car.status === 'Vendido').reduce((s, r) => s + (r.margin || 0), 0) / soldCount) : 0;

    // Atualiza KPIs
    document.getElementById('dashTotalSpent').textContent = formatCurrency(totalSpent);
    document.getElementById('dashTotalProfit').textContent = formatCurrency(totalProfit);
    document.getElementById('dashAvgMargin').textContent = formatPercent(avgMargin);
    document.getElementById('dashTotalRevenue').textContent = formatCurrency(totalRevenue);

    // Aplica cor ao lucro
    document.getElementById('dashTotalProfit').className = `stat-value ${totalProfit >= 0 ? 'text-success' : 'text-danger'}`;

    // Gráfico: Gastos por Categoria (Doughnut)
    const categoryCanvas = document.getElementById('carCategoryExpensesChart');
    const comparisonCanvas = document.getElementById('carComparisonChart');

    if (categoryCanvas) {
        if (carCategoryChartInstance) carCategoryChartInstance.destroy();
        const catLabels = Object.keys(categoryMap);
        const catValues = Object.values(categoryMap);

        carCategoryChartInstance = new Chart(categoryCanvas.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: catLabels.length ? catLabels : ['Sem dados'],
                datasets: [{
                    data: catValues.length ? catValues : [1],
                    backgroundColor: [
                        '#EA580C', '#F59E0B', '#EF4444', '#10B981',
                        '#3B82F6', '#8B5CF6', '#EC4899', '#06B6D4', '#64748B'
                    ],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '65%',
                plugins: {
                    legend: {
                        position: 'right',
                        labels: { color: '#F3F4F6', font: { family: 'Plus Jakarta Sans', size: 11 } }
                    },
                    tooltip: {
                        callbacks: {
                            label: (c) => `${c.label}: ${formatCurrency(c.parsed)}`
                        }
                    }
                }
            }
        });
    }

    // Gráfico: Lucro Líquido por Veículo Vendido (Bar — verde/vermelho)
    if (comparisonCanvas) {
        if (carComparisonChartInstance) carComparisonChartInstance.destroy();

        // Apenas carros vendidos entram no gráfico
        const soldRows = tableRows.filter(r => r.car.status === 'Vendido');
        const profitLabels = soldRows.map(r => {
            const m = r.car.model.length > 14 ? r.car.model.substring(0, 12) + '…' : r.car.model;
            return m + (r.car.plate ? ` (${r.car.plate})` : '');
        });
        const profitValues = soldRows.map(r => r.profit);
        const profitColors = profitValues.map(v => v >= 0 ? 'rgba(16, 185, 129, 0.75)' : 'rgba(239, 68, 68, 0.75)');
        const profitBorders = profitValues.map(v => v >= 0 ? '#10B981' : '#EF4444');

        carComparisonChartInstance = new Chart(comparisonCanvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels: profitLabels.length ? profitLabels : ['Nenhum vendido'],
                datasets: [{
                    label: 'Lucro Líquido (R$)',
                    data: profitValues.length ? profitValues : [0],
                    backgroundColor: profitColors.length ? profitColors : ['rgba(100,116,139,0.5)'],
                    borderColor: profitBorders.length ? profitBorders : ['#64748B'],
                    borderWidth: 1,
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (c) => {
                                const v = c.parsed.y;
                                return `Lucro: ${formatCurrency(v)} ${v >= 0 ? '✅' : '❌'}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { color: '#9CA3AF', font: { family: 'Plus Jakarta Sans', size: 10 } }
                    },
                    y: {
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: {
                            color: '#9CA3AF',
                            font: { family: 'Plus Jakarta Sans' },
                            callback: (v) => formatCurrency(v)
                        }
                    }
                }
            }
        });
    }


    // Tabela Consolidada
    const tbody = document.getElementById('carConsolidatedTableBody');
    if (tbody) {
        tbody.innerHTML = '';

        if (tableRows.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" class="empty-state">
                        <span class="empty-state-icon">🚗</span>
                        Nenhum veículo cadastrado ainda.
                    </td>
                </tr>
            `;
        } else {
            tableRows.forEach(({ car, totalExpenses, totalCost, salePrice, profit, margin }) => {
                const statusClass = getCarStatusBadgeClass(car.status);
                const profitClass = car.status === 'Vendido' ? (profit >= 0 ? 'text-success' : 'text-danger') : 'text-muted';
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>${car.model}</strong><div style="font-size:0.78rem;color:var(--text-muted)">${car.year || ''}</div></td>
                    <td>${car.plate || '--'}</td>
                    <td>${formatCurrency(car.bidAmount)}</td>
                    <td class="text-amber">${formatCurrency(totalExpenses)}</td>
                    <td><strong>${formatCurrency(totalCost)}</strong></td>
                    <td>${salePrice > 0 ? formatCurrency(salePrice) : '<span style="color:var(--text-muted)">--</span>'}</td>
                    <td class="${profitClass}">${car.status === 'Vendido' ? '<strong>' + formatCurrency(profit) + '</strong>' : '--'}</td>
                    <td class="${profitClass}">${margin !== null ? formatPercent(margin) : '--'}</td>
                    <td><span class="segment-tag ${statusClass}">${car.status}</span></td>
                `;
                tbody.appendChild(tr);
            });
        }
    }
}

function exportConsolidatedCarsCsv() {
    const user = window.db.getCurrentUser();
    if (!user) return;

    const cars = window.db.getUserCars(user.id);
    if (!cars.length) {
        showToast('Nenhum veículo cadastrado para exportar.', 'info');
        return;
    }

    let csvContent = 'data:text/csv;charset=utf-8,';
    csvContent += 'Veiculo,Ano,Placa,Lance (Compra),Gastos Planilha,Custo Total,Preco Venda,Lucro Liquido,Margem (%),Status\n';

    cars.forEach(car => {
        const expenses = car.expenses || [];
        const totalExp = expenses.reduce((acc, e) => acc + (parseFloat(e.amount) || 0), 0);
        const bid = parseFloat(car.bidAmount) || 0;
        const cost = bid + totalExp;
        const sale = parseFloat(car.salePrice) || 0;
        const profit = car.status === 'Vendido' ? sale - cost : 0;
        const margin = (car.status === 'Vendido' && cost > 0) ? (profit / cost) * 100 : 0;

        csvContent += `"${car.model}","${car.year || ''}","${car.plate || ''}",${bid.toFixed(2)},${totalExp.toFixed(2)},${cost.toFixed(2)},${sale > 0 ? sale.toFixed(2) : ''},${car.status === 'Vendido' ? profit.toFixed(2) : ''},${car.status === 'Vendido' ? margin.toFixed(2) + '%' : ''},"${car.status}"\n`;
    });

    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', `relatorio_carros_leilao.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// =========================================================
// CDB FUNCTIONS (RENDA FIXA)
// =========================================================

let cdbIssuerChartInstance = null;
let cdbIncomeChartInstance = null;
let cdbEquityChartInstance = null;
let cdbSimulationData = [];

function switchCdbSubView(targetSubViewId) {
    document.querySelectorAll('.cdb-subview').forEach(sub => {
        sub.classList.remove('active');
    });

    document.querySelectorAll('.sub-nav-btn.cdb-sub-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-cdb-subtarget') === targetSubViewId) {
            btn.classList.add('active');
        }
    });

    const target = document.getElementById(targetSubViewId);
    if (target) target.classList.add('active');

    if (targetSubViewId === 'cdbSubPortfolio') {
        renderCdbPortfolioView();
    }
}

function getCdbIRRate(days) {
    if (days <= 180) return 0.225;
    if (days <= 360) return 0.20;
    if (days <= 720) return 0.175;
    return 0.15;
}

function getCdbIRRateByMonths(months) {
    return getCdbIRRate(months * 30.4368);
}

function getCdbMonthlyRate(rateType, rateValue, cdiBase = 10.75) {
    let annualRate = 0;
    if (rateType === 'CDI') {
        annualRate = (cdiBase / 100) * (rateValue / 100);
    } else {
        annualRate = rateValue / 100;
    }
    return Math.pow(1 + annualRate, 1 / 12) - 1;
}

function getCdbCurrentStatus(cdb, cdiBase = 10.75) {
    const start = new Date(cdb.startDate);
    const today = new Date();
    
    let diffMonths = (today.getFullYear() - start.getFullYear()) * 12 + today.getMonth() - start.getMonth();
    if (diffMonths < 0) diffMonths = 0;
    if (diffMonths > cdb.termMonths) diffMonths = cdb.termMonths;

    const monthlyRate = getCdbMonthlyRate(cdb.rentabilityType, cdb.rentabilityRate, cdiBase);
    let balanceGross = cdb.investmentAmount;
    let totalDeposited = cdb.investmentAmount;
    const monthlyContribution = parseFloat(cdb.monthlyContribution) || 0;
    
    for (let m = 1; m <= diffMonths; m++) {
        balanceGross = (balanceGross * (1 + monthlyRate)) + monthlyContribution;
        totalDeposited += monthlyContribution;
    }
    
    const profit = balanceGross - totalDeposited;
    const irRate = getCdbIRRateByMonths(diffMonths || 1);
    const tax = profit > 0 ? profit * irRate : 0;
    const balanceNet = balanceGross - tax;
    
    return {
        elapsedMonths: diffMonths,
        totalDeposited,
        balanceGross,
        profit,
        tax,
        balanceNet
    };
}

function runCdbSimulation(initial, monthly, rateType, rateValue, durationMonths, cdiBase = 10.75) {
    const monthlyRate = getCdbMonthlyRate(rateType, rateValue, cdiBase);
    let balanceGross = initial;
    let totalDeposited = initial;
    const monthsData = [];

    for (let m = 1; m <= durationMonths; m++) {
        const prevBalanceGross = balanceGross;
        const interest = prevBalanceGross * monthlyRate;
        balanceGross = prevBalanceGross + interest + monthly;
        totalDeposited += monthly;

        const totalProfit = balanceGross - totalDeposited;
        const irRate = getCdbIRRateByMonths(m);
        const irPaid = totalProfit > 0 ? totalProfit * irRate : 0;
        const balanceNet = balanceGross - irPaid;

        monthsData.push({
            month: m,
            deposited: totalDeposited,
            balanceGross: balanceGross,
            interest: interest,
            profit: totalProfit,
            tax: irPaid,
            balanceNet: balanceNet
        });
    }
    return monthsData;
}

function renderCdbPortfolioView() {
    const user = window.db.getCurrentUser();
    const guestPrompt = document.getElementById('cdbGuestPrompt');
    const content = document.getElementById('cdbContent');

    if (!user) {
        guestPrompt.style.display = 'block';
        content.style.display = 'none';
        return;
    }

    guestPrompt.style.display = 'none';
    content.style.display = 'block';

    const cdbs = window.db.getUserCDBs(user.id);

    let totalApplied = 0;
    let totalGrossReturn = 0;
    let totalTax = 0;
    let totalNetValue = 0;

    const issuerDistribution = {};
    const cdbIncomeData = [];

    cdbs.forEach(cdb => {
        const status = getCdbCurrentStatus(cdb);
        totalApplied += cdb.investmentAmount;
        totalGrossReturn += status.profit;
        totalTax += status.tax;
        totalNetValue += status.balanceNet;

        issuerDistribution[cdb.bank] = (issuerDistribution[cdb.bank] || 0) + status.balanceNet;

        cdbIncomeData.push({
            bank: cdb.bank,
            rate: cdb.rentabilityType === 'CDI' ? `${cdb.rentabilityRate}% CDI` : `${cdb.rentabilityRate}% a.a.`,
            gross: status.balanceGross,
            net: status.balanceNet
        });
    });

    document.getElementById('cdbTotalInvested').textContent = formatCurrency(totalApplied);
    document.getElementById('cdbTotalGrossReturn').textContent = formatCurrency(totalGrossReturn);
    document.getElementById('cdbTotalTax').textContent = formatCurrency(totalTax);
    document.getElementById('cdbTotalNetValue').textContent = formatCurrency(totalNetValue);

    renderCdbTable(cdbs);
    renderCdbCharts(issuerDistribution, cdbIncomeData);
}

function renderCdbTable(cdbs) {
    const tbody = document.getElementById('cdbTableBody');
    tbody.innerHTML = '';

    if (!cdbs || cdbs.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="10" class="empty-state">
                    <span class="empty-state-icon">📂</span>
                    Nenhum CDB cadastrado ainda. Clique em "<strong>+ Adicionar CDB</strong>" acima para começar!
                </td>
            </tr>
        `;
        return;
    }

    cdbs.forEach(cdb => {
        const status = getCdbCurrentStatus(cdb);
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <strong>${cdb.bank}</strong>
                ${cdb.notes ? `<div style="font-size: 0.75rem; color: var(--text-muted);">${cdb.notes}</div>` : ''}
            </td>
            <td><span class="segment-tag ${cdb.rentabilityType === 'CDI' ? 'badge-fiagro' : 'badge-logistica'}">${cdb.rentabilityType === 'CDI' ? 'Pós-fixado' : 'Pré-fixado'}</span></td>
            <td><strong>${cdb.rentabilityRate}%</strong></td>
            <td>${formatCurrency(cdb.investmentAmount)}</td>
            <td>${formatDateBR(cdb.startDate)}</td>
            <td>${cdb.termMonths} meses</td>
            <td class="text-success"><strong>+ ${formatCurrency(status.profit)}</strong></td>
            <td class="text-danger">${formatCurrency(status.tax)}</td>
            <td><strong>${formatCurrency(status.balanceNet)}</strong></td>
            <td style="text-align: right;">
                <div class="table-actions-cell" style="justify-content: flex-end;">
                    <button class="btn-table-action" title="Editar CDB" data-action="edit-cdb" data-id="${cdb.id}">
                        ✏️
                    </button>
                    <button class="btn-table-action delete" title="Excluir CDB" data-action="delete-cdb" data-id="${cdb.id}">
                        🗑️
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll('button[data-action]').forEach(btn => {
        btn.addEventListener('click', () => {
            const action = btn.getAttribute('data-action');
            const id = btn.getAttribute('data-id');
            const cdb = cdbs.find(item => item.id === id);

            if (action === 'edit-cdb' && cdb) {
                openEditCdbModal(cdb);
            } else if (action === 'delete-cdb' && cdb) {
                deleteCdbConfirm(cdb);
            }
        });
    });
}

function renderCdbCharts(issuerData, cdbIncomeData) {
    const issuerCanvas = document.getElementById('cdbIssuerChart');
    const incomeCanvas = document.getElementById('cdbIncomeChart');

    if (!issuerCanvas || !incomeCanvas) return;

    const issuerLabels = Object.keys(issuerData);
    const issuerValues = Object.values(issuerData);

    if (cdbIssuerChartInstance) {
        cdbIssuerChartInstance.destroy();
    }

    if (issuerLabels.length === 0) {
        issuerLabels.push('Sem dados');
        issuerValues.push(1);
    }

    cdbIssuerChartInstance = new Chart(issuerCanvas.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: issuerLabels,
            datasets: [{
                data: issuerValues,
                backgroundColor: [
                    '#10B981', '#34D399', '#059669', '#6EE7B7', 
                    '#047857', '#A7F3D0', '#111827', '#64748B'
                ],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: { color: '#F3F4F6', font: { family: 'Plus Jakarta Sans', size: 11 } }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.label}: ${formatCurrency(context.parsed)}`;
                        }
                    }
                }
            },
            cutout: '68%'
        }
    });

    const cdbLabels = cdbIncomeData.map(i => `${i.bank} (${i.rate})`);
    const cdbGrossValues = cdbIncomeData.map(i => i.gross);
    const cdbNetValues = cdbIncomeData.map(i => i.net);

    if (cdbIncomeChartInstance) {
        cdbIncomeChartInstance.destroy();
    }

    cdbIncomeChartInstance = new Chart(incomeCanvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: cdbLabels.length ? cdbLabels : ['Sem dados'],
            datasets: [
                {
                    label: 'Bruto (R$)',
                    data: cdbGrossValues.length ? cdbGrossValues : [0],
                    backgroundColor: 'rgba(107, 114, 128, 0.6)',
                    borderColor: '#9CA3AF',
                    borderWidth: 1,
                    borderRadius: 6
                },
                {
                    label: 'Líquido (R$)',
                    data: cdbNetValues.length ? cdbNetValues : [0],
                    backgroundColor: 'rgba(16, 185, 129, 0.75)',
                    borderColor: '#10B981',
                    borderWidth: 1,
                    borderRadius: 6
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#FFF' } },
                tooltip: {
                    callbacks: {
                        label: (c) => `${c.dataset.label}: ${formatCurrency(c.raw)}`
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: '#9CA3AF', font: { family: 'Plus Jakarta Sans' } }
                },
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: {
                        color: '#9CA3AF',
                        font: { family: 'Plus Jakarta Sans' },
                        callback: (v) => formatCurrency(v)
                    }
                }
            }
        }
    });
}

function openAddCdbModal() {
    document.getElementById('cdbModalTitle').textContent = 'Adicionar CDB à Carteira';
    document.getElementById('cdbEditId').value = '';
    document.getElementById('cdbForm').reset();
    document.getElementById('cdbStartDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('cdbModal').classList.add('open');
}

function openEditCdbModal(cdb) {
    document.getElementById('cdbModalTitle').textContent = 'Editar Investimento CDB';
    document.getElementById('cdbEditId').value = cdb.id;
    document.getElementById('cdbBank').value = cdb.bank;
    document.getElementById('cdbRateType').value = cdb.rentabilityType;
    document.getElementById('cdbRate').value = cdb.rentabilityRate;
    document.getElementById('cdbInvestmentAmount').value = cdb.investmentAmount;
    document.getElementById('cdbMonthlyContribution').value = cdb.monthlyContribution || 0;
    document.getElementById('cdbStartDate').value = cdb.startDate;
    document.getElementById('cdbTermMonths').value = cdb.termMonths;
    document.getElementById('cdbNotes').value = cdb.notes || '';
    document.getElementById('cdbModal').classList.add('open');
}

function closeCdbModal() {
    document.getElementById('cdbModal').classList.remove('open');
}

function deleteCdbConfirm(cdb) {
    if (confirm(`Deseja realmente remover o CDB do ${cdb.bank} (${cdb.rentabilityRate}%) da sua carteira?`)) {
        try {
            window.db.deleteCDB(cdb.id);
            renderCdbPortfolioView();
            showToast('CDB removido com sucesso!', 'success');
        } catch (err) {
            showToast(err.message, 'error');
        }
    }
}

function calculateCdbSimulation() {
    const initial = parseFloat(document.getElementById('cdbSimInitial').value) || 0;
    const monthly = parseFloat(document.getElementById('cdbSimMonthly').value) || 0;
    const rateType = document.getElementById('cdbSimRateType').value;
    const rateValue = parseFloat(document.getElementById('cdbSimRate').value) || 0;
    const durationInput = parseInt(document.getElementById('cdbSimDuration').value) || 0;
    const durationUnit = document.getElementById('cdbSimDurationUnit').value;
    const cdiBase = parseFloat(document.getElementById('cdbSimCdiBase').value) || 10.75;

    const termMonths = durationUnit === 'years' ? durationInput * 12 : durationInput;

    if (termMonths <= 0 || rateValue <= 0) {
        showToast('Preencha os campos com valores válidos.', 'error');
        return;
    }

    const simulation = runCdbSimulation(initial, monthly, rateType, rateValue, termMonths, cdiBase);
    cdbSimulationData = simulation;

    const finalRow = simulation[simulation.length - 1];
    const totalDeposited = finalRow.deposited;
    const finalNet = finalRow.balanceNet;
    const finalGross = finalRow.balanceGross;
    const finalTax = finalRow.tax;
    const grossProfit = finalGross - totalDeposited;

    document.getElementById('cdbSimTotalDepositedText').textContent = formatCurrency(totalDeposited);
    document.getElementById('cdbSimNetValueText').textContent = formatCurrency(finalNet);
    document.getElementById('cdbSimResultDurationText').textContent = `${termMonths} meses (${(termMonths/12).toFixed(1)} anos)`;
    document.getElementById('cdbSimResultGrossProfitText').textContent = `+ ${formatCurrency(grossProfit)}`;
    document.getElementById('cdbSimResultTaxText').textContent = `- ${formatCurrency(finalTax)}`;

    const netYield = totalDeposited > 0 ? (finalNet - totalDeposited) / totalDeposited * 100 : 0;
    document.getElementById('cdbSimResultNetYieldText').textContent = formatPercent(netYield);

    // Tabela
    const tbody = document.getElementById('cdbSimulationTableBody');
    tbody.innerHTML = '';
    simulation.forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>Mês ${row.month}</td>
            <td>${formatCurrency(row.deposited)}</td>
            <td><strong>${formatCurrency(row.balanceGross)}</strong></td>
            <td class="text-success">+ ${formatCurrency(row.profit)}</td>
            <td class="text-danger">${formatCurrency(row.tax)}</td>
            <td><strong>${formatCurrency(row.balanceNet)}</strong></td>
        `;
        tbody.appendChild(tr);
    });

    document.getElementById('cdbExportCsvBtn').style.display = 'inline-block';

    // Gráfico
    const ctx = document.getElementById('cdbEquityChart');
    if (!ctx) return;

    const labels = simulation.map(r => `Mês ${r.month}`);
    const grossData = simulation.map(r => r.balanceGross);
    const netData = simulation.map(r => r.balanceNet);
    const investedData = simulation.map(r => r.deposited);

    if (cdbEquityChartInstance) {
        cdbEquityChartInstance.destroy();
    }

    cdbEquityChartInstance = new Chart(ctx.getContext('2d'), {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Saldo Bruto',
                    data: grossData,
                    borderColor: '#A7F3D0',
                    backgroundColor: 'rgba(167, 243, 208, 0.05)',
                    borderWidth: 2,
                    tension: 0.3,
                    fill: true
                },
                {
                    label: 'Saldo Líquido',
                    data: netData,
                    borderColor: '#10B981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    borderWidth: 3,
                    tension: 0.3,
                    fill: true
                },
                {
                    label: 'Total Investido',
                    data: investedData,
                    borderColor: '#9CA3AF',
                    borderDash: [5, 5],
                    borderWidth: 2,
                    fill: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#FFF' } },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: (context) => `${context.dataset.label}: ${formatCurrency(context.raw)}`
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#9CA3AF' }
                },
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: {
                        color: '#9CA3AF',
                        callback: (v) => formatCurrency(v)
                    }
                }
            }
        }
    });
}

function exportCdbSimulationCSV() {
    if (!cdbSimulationData || cdbSimulationData.length === 0) return;

    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Mes,Aportado Acumulado,Saldo Bruto,Rendimento Bruto,Imposto Provisorio,Saldo Liquido\n";

    cdbSimulationData.forEach(row => {
        csvContent += `${row.month},${row.deposited.toFixed(2)},${row.balanceGross.toFixed(2)},${row.profit.toFixed(2)},${row.tax.toFixed(2)},${row.balanceNet.toFixed(2)}\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "simulacao_cdb.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function exportCdbPortfolioCSV() {
    const user = window.db.getCurrentUser();
    if (!user) return;

    const cdbs = window.db.getUserCDBs(user.id);
    if (!cdbs.length) {
        showToast('Nenhum CDB cadastrado para exportar.', 'info');
        return;
    }

    let csvContent = 'data:text/csv;charset=utf-8,';
    csvContent += 'Banco Emissor,Indexador,Taxa,Valor Aplicado,Data Inicio,Prazo (Meses),Rendimento Bruto,IR Provisorio,Saldo Liquido\n';

    cdbs.forEach(cdb => {
        const status = getCdbCurrentStatus(cdb);
        csvContent += `"${cdb.bank}","${cdb.rentabilityType}",${cdb.rentabilityRate},${cdb.investmentAmount.toFixed(2)},"${cdb.startDate}",${cdb.termMonths},${status.profit.toFixed(2)},${status.tax.toFixed(2)},${status.balanceNet.toFixed(2)}\n`;
    });

    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', 'carteira_cdb.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// =========================================================
// 12. INICIALIZAÇÃO & EVENT LISTENERS
// =========================================================

document.addEventListener('DOMContentLoaded', () => {
    updateAuthUI();

    // Navegação Principal da Sidebar
    document.querySelectorAll('.main-nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.getAttribute('data-target');
            switchMainModule(target);
        });
    });

    document.getElementById('brandHomeBtn').addEventListener('click', () => {
        switchMainModule('fiiModule');
    });

    // Sub-Navegação interna de FIIs
    document.querySelectorAll('.sub-nav-btn:not(.car-sub-btn):not(.cdb-sub-btn)').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.getAttribute('data-subtarget');
            switchFiiSubView(target);
        });
    });

    // Sub-Navegação interna de Carros de Leilão
    document.querySelectorAll('.sub-nav-btn.car-sub-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.getAttribute('data-car-subtarget');
            switchCarSubView(target);
        });
    });

    // Sub-Navegação interna de CDB
    document.querySelectorAll('.sub-nav-btn.cdb-sub-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.getAttribute('data-cdb-subtarget');
            switchCdbSubView(target);
        });
    });

    // Mobile Sidebar
    const mobileMenuBtn = document.getElementById('btnMobileMenuToggle');
    const sidebar = document.getElementById('appSidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');

    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', () => {
            sidebar.classList.toggle('open');
            sidebarOverlay.classList.toggle('open');
        });
    }

    if (sidebarOverlay) {
        sidebarOverlay.addEventListener('click', closeMobileSidebar);
    }

    // Calculadora FIIs
    const customSelect = document.getElementById('customDurationSelect');
    const selectTrigger = customSelect.querySelector('.custom-select-trigger');
    const options = customSelect.querySelectorAll('.custom-option');
    const hiddenInput = document.getElementById('durationUnit');

    selectTrigger.addEventListener('click', (e) => {
        customSelect.classList.toggle('open');
        e.stopPropagation();
    });

    options.forEach(option => {
        option.addEventListener('click', function() {
            options.forEach(opt => opt.classList.remove('selected'));
            this.classList.add('selected');
            hiddenInput.value = this.getAttribute('data-value');
            selectTrigger.querySelector('span').textContent = this.textContent;
            customSelect.classList.remove('open');
        });
    });

    window.addEventListener('click', () => {
        customSelect.classList.remove('open');
    });

    document.getElementById('reinvestGroup').addEventListener('click', (e) => {
        if (e.target.tagName !== 'INPUT') {
            const chk = document.getElementById('reinvestDividends');
            chk.checked = !chk.checked;
        }
    });

    document.getElementById('simulatorForm').addEventListener('submit', (e) => {
        e.preventDefault();
        calculateSimulation();
    });

    document.getElementById('exportCsvBtn').addEventListener('click', exportSimulationCSV);
    document.getElementById('btnExportPortfolioCsv').addEventListener('click', exportPortfolioCSV);

    // Auth Listeners
    document.getElementById('closeAuthModalBtn').addEventListener('click', closeAuthModal);
    document.getElementById('tabLoginSwitch').addEventListener('click', () => openAuthModal('login'));
    document.getElementById('tabRegisterSwitch').addEventListener('click', () => openAuthModal('register'));

    document.getElementById('btnPromptLogin').addEventListener('click', () => openAuthModal('login'));
    document.getElementById('btnCarPromptLogin').addEventListener('click', () => openAuthModal('login'));

    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('loginEmail').value;
        const pass = document.getElementById('loginPassword').value;
        try {
            const user = await window.db.loginUser(email, pass);
            closeAuthModal();
            updateAuthUI();
            renderPortfolioView();
            renderCarCardsListView();
            renderCdbPortfolioView();
            showToast(`Bem-vindo de volta, ${user.name}!`, 'success');
        } catch (err) {
            showToast(err.message, 'error');
        }
    });

    document.getElementById('registerForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('regName').value;
        const email = document.getElementById('regEmail').value;
        const pass = document.getElementById('regPassword').value;
        try {
            const user = await window.db.registerUser(name, email, pass);
            closeAuthModal();
            updateAuthUI();
            renderPortfolioView();
            renderCarCardsListView();
            renderCdbPortfolioView();
            showToast(`Conta criada com sucesso! Olá, ${user.name}!`, 'success');
        } catch (err) {
            showToast(err.message, 'error');
        }
    });

    const handleDemoLogin = async () => {
        try {
            const demoUser = await window.db.createOrLoginDemoUser();
            closeAuthModal();
            updateAuthUI();
            renderPortfolioView();
            renderCarCardsListView();
            renderCdbPortfolioView();
            showToast('Conectado à Conta Demo com dados de FIIs, Carros e CDBs!', 'success');
        } catch (err) {
            showToast(err.message, 'error');
        }
    };

    document.getElementById('btnDemoLogin').addEventListener('click', handleDemoLogin);
    document.getElementById('btnPromptDemo').addEventListener('click', handleDemoLogin);
    document.getElementById('btnCarPromptDemo').addEventListener('click', handleDemoLogin);
    document.getElementById('btnCdbPromptDemo').addEventListener('click', handleDemoLogin);

    // FII Portfolio
    document.getElementById('btnOpenAddInvestment').addEventListener('click', () => openAddInvestmentModal());
    document.getElementById('closeInvestmentModalBtn').addEventListener('click', closeInvestmentModal);

    document.getElementById('investmentForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const editId = document.getElementById('invEditId').value;
        try {
            window.db.saveInvestment({
                id: editId || undefined,
                ticker: document.getElementById('invTicker').value,
                segment: document.getElementById('invSegment').value,
                shares: document.getElementById('invShares').value,
                avgPrice: document.getElementById('invAvgPrice').value,
                lastDividend: document.getElementById('invLastDividend').value,
                notes: document.getElementById('invNotes').value
            });

            closeInvestmentModal();
            renderPortfolioView();
            showToast(editId ? 'FII atualizado!' : 'FII cadastrado na carteira!', 'success');
        } catch (err) {
            showToast(err.message, 'error');
        }
    });

    // FII Aporte
    document.getElementById('closeBuyModalBtn').addEventListener('click', closeBuySharesModal);

    ['buyNewShares', 'buyPrice', 'buyDividend'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', updateBuyPreview);
    });

    document.querySelectorAll('.quick-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            const add = parseInt(pill.getAttribute('data-add')) || 0;
            const input = document.getElementById('buyNewShares');
            input.value = (parseInt(input.value) || 0) + add;
            updateBuyPreview();
        });
    });

    document.getElementById('buySharesForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const invId = document.getElementById('buyInvestmentId').value;
        const addShares = parseInt(document.getElementById('buyNewShares').value);
        const price = parseFloat(document.getElementById('buyPrice').value);
        const div = parseFloat(document.getElementById('buyDividend').value);

        try {
            const updated = window.db.buyMoreShares(invId, addShares, price, div);
            closeBuySharesModal();
            renderPortfolioView();
            showToast(`Aporte registrado em ${updated.ticker}! Novo PM: ${formatCurrency(updated.avgPrice)}`, 'success');
        } catch (err) {
            showToast(err.message, 'error');
        }
    });

    // Radar Filters
    document.querySelectorAll('#radarFilterPills .filter-pill-btn').forEach(pill => {
        pill.addEventListener('click', () => {
            document.querySelectorAll('#radarFilterPills .filter-pill-btn').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            activeRadarFilter = pill.getAttribute('data-segment');
            renderRadarCards(activeRadarFilter, document.getElementById('radarSearchInput')?.value || '');
        });
    });

    document.getElementById('radarSearchInput')?.addEventListener('input', (e) => {
        renderRadarCards(activeRadarFilter, e.target.value);
    });

    // =========================================================
    // EVENT LISTENERS: CARROS DE LEILÃO (CARDS & PLANILHA)
    // =========================================================

    document.getElementById('btnOpenAddCarModal').addEventListener('click', openAddCarModal);
    document.getElementById('closeCarModalBtn').addEventListener('click', closeCarModal);
    document.getElementById('closeCarSaleModalBtn').addEventListener('click', closeCarSaleModal);

    // Voltar da planilha para a grade de cards
    document.getElementById('btnBackToCarCards').addEventListener('click', () => {
        renderCarCardsListView();
    });

    // Filtros de Cards de Carros
    document.querySelectorAll('#carCardsFilterPills .filter-pill-btn').forEach(pill => {
        pill.addEventListener('click', () => {
            document.querySelectorAll('#carCardsFilterPills .filter-pill-btn').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            activeCarCardsFilter = pill.getAttribute('data-filter-status');
            renderCarCardsListView();
        });
    });

    document.getElementById('carCardsSearchInput')?.addEventListener('input', () => {
        renderCarCardsListView();
    });

    // Salvar Novo Carro (Card)
    document.getElementById('carForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const editId = document.getElementById('carEditId').value;
        const carData = {
            id: editId || undefined,
            model: document.getElementById('carModel').value,
            year: document.getElementById('carYear').value,
            plate: document.getElementById('carPlate').value,
            auctioneer: document.getElementById('carAuctioneer').value,
            purchaseDate: document.getElementById('carPurchaseDate').value,
            bidAmount: document.getElementById('carBid').value,
            fipeValue: document.getElementById('carFipe').value,
            status: document.getElementById('carStatus').value,
            notes: document.getElementById('carNotes').value
        };

        try {
            const updatedList = window.db.saveCar(carData);
            closeCarModal();
            renderCarCardsListView();
            showToast(editId ? 'Carro atualizado com sucesso!' : 'Carro adicionado! Clique no card para abrir a planilha.', 'success');
        } catch (err) {
            showToast(err.message, 'error');
        }
    });

    // Inserir Gasto / Serviço na Planilha Estilo Excel
    document.getElementById('addExpenseForm').addEventListener('submit', (e) => {
        e.preventDefault();
        if (!selectedCarForSpreadsheet) return;

        const expenseData = {
            date: document.getElementById('expDate').value,
            category: document.getElementById('expCategory').value,
            description: document.getElementById('expDescription').value,
            supplier: document.getElementById('expSupplier').value,
            amount: document.getElementById('expAmount').value
        };

        try {
            const updatedCar = window.db.addCarExpense(selectedCarForSpreadsheet.id, expenseData);
            selectedCarForSpreadsheet = updatedCar;
            updateCarSpreadsheetHeader();
            renderCarExpensesTable();
            renderCarVehicleDashboard();

            // Limpa apenas a descrição, fornecedor e valor para agilizar novos lançamentos
            document.getElementById('expDescription').value = '';
            document.getElementById('expSupplier').value = '';
            document.getElementById('expAmount').value = '';
            document.getElementById('expDescription').focus();

            showToast('Gasto lançado na planilha com sucesso!', 'success');
        } catch (err) {
            showToast(err.message, 'error');
        }
    });

    // Exportar CSV da Planilha do Carro
    document.getElementById('btnExportCurrentCarCsv').addEventListener('click', exportCurrentCarCSV);

    // Abrir Modal de Status de Venda a partir da Planilha
    document.getElementById('btnEditCarSaleStatus').addEventListener('click', openCarSaleStatusModal);

    // Salvar Status de Venda
    document.getElementById('carSaleForm').addEventListener('submit', (e) => {
        e.preventDefault();
        if (!selectedCarForSpreadsheet) return;

        const newStatus = document.getElementById('modalCarStatusSelect').value;
        const newSalePrice = parseFloat(document.getElementById('modalSalePrice').value) || 0;
        const newSaleDate = document.getElementById('modalSaleDate').value;

        try {
            const updatedCar = {
                ...selectedCarForSpreadsheet,
                status: newStatus,
                salePrice: newSalePrice,
                saleDate: newSaleDate
            };

            window.db.saveCar(updatedCar);
            selectedCarForSpreadsheet = updatedCar;
            closeCarSaleModal();
            updateCarSpreadsheetHeader();
            showToast('Status do carro atualizado!', 'success');
        } catch (err) {
            showToast(err.message, 'error');
        }
    });

    // CDB Event Listeners
    document.getElementById('btnOpenAddCdb')?.addEventListener('click', openAddCdbModal);
    document.getElementById('closeCdbModalBtn')?.addEventListener('click', closeCdbModal);
    document.getElementById('btnCdbPromptLogin')?.addEventListener('click', () => openAuthModal('login'));

    document.getElementById('cdbForm')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const editId = document.getElementById('cdbEditId').value;
        const cdbData = {
            id: editId || undefined,
            bank: document.getElementById('cdbBank').value,
            rentabilityType: document.getElementById('cdbRateType').value,
            rentabilityRate: parseFloat(document.getElementById('cdbRate').value),
            investmentAmount: parseFloat(document.getElementById('cdbInvestmentAmount').value),
            monthlyContribution: parseFloat(document.getElementById('cdbMonthlyContribution').value) || 0,
            startDate: document.getElementById('cdbStartDate').value,
            termMonths: parseInt(document.getElementById('cdbTermMonths').value) || 12,
            notes: document.getElementById('cdbNotes').value
        };

        try {
            window.db.saveCDB(cdbData);
            closeCdbModal();
            renderCdbPortfolioView();
            showToast(editId ? 'Investimento CDB atualizado!' : 'Investimento CDB cadastrado!', 'success');
        } catch (err) {
            showToast(err.message, 'error');
        }
    });

    document.getElementById('cdbSimulatorForm')?.addEventListener('submit', (e) => {
        e.preventDefault();
        calculateCdbSimulation();
    });

    document.getElementById('cdbExportCsvBtn')?.addEventListener('click', exportCdbSimulationCSV);
    document.getElementById('btnExportCdbCsv')?.addEventListener('click', exportCdbPortfolioCSV);

    // Fechar modais ao clicar fora
    window.addEventListener('click', (e) => {
        const authModal = document.getElementById('authModal');
        const invModal = document.getElementById('investmentModal');
        const buyModal = document.getElementById('buySharesModal');
        const carModal = document.getElementById('carModal');
        const carSaleModal = document.getElementById('carSaleModal');
        const cdbModal = document.getElementById('cdbModal');

        if (e.target === authModal) closeAuthModal();
        if (e.target === invModal) closeInvestmentModal();
        if (e.target === buyModal) closeBuySharesModal();
        if (e.target === carModal) closeCarModal();
        if (e.target === carSaleModal) closeCarSaleModal();
        if (e.target === cdbModal) closeCdbModal();
    });

    // Exportar relatório consolidado de carros
    document.getElementById('btnExportConsolidatedCarsCsv')?.addEventListener('click', exportConsolidatedCarsCsv);

    // Inicializar visualizações se houver usuário
    const initialUser = window.db.getCurrentUser();
    if (initialUser) {
        renderCdbPortfolioView();
    }

    if (document.getElementById('sharePrice').value) {
        calculateSimulation();
    }
});
