/**
 * JS/Leilao/leilao.js
 * Lógica do Módulo de Gestão de Leilões (AutoLeilão Hub)
 */

const state = {
    veiculos: [],
    filtroStatus: 'Todos',
    filtroBusca: '',
    veiculoEmEdicao: null,
    tema: localStorage.getItem('financehub_theme') || 'dark',
    modoApi: true
};

const API_BASE = '/api';

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initMobileNavigation();
    initEventListeners();
    initCalculationTriggers();
    carregarVeiculos();
});

function initTheme() {
    const root = document.documentElement;
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    const themeLabel = document.getElementById('themeLabel');

    applyTheme(state.tema);

    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            state.tema = state.tema === 'dark' ? 'light' : 'dark';
            applyTheme(state.tema);
            localStorage.setItem('financehub_theme', state.tema);
        });
    }

    function applyTheme(theme) {
        root.setAttribute('data-theme', theme);
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

function initEventListeners() {
    const btnHeader = document.getElementById('btnNovoVeiculoHeader');
    const btnWelcome = document.getElementById('btnCadastrarNovoCarro');
    const btnEmpty = document.getElementById('btnEmptyCadastrar');

    if (btnHeader) btnHeader.addEventListener('click', () => abrirModalCadastro());
    if (btnWelcome) btnWelcome.addEventListener('click', () => abrirModalCadastro());
    if (btnEmpty) btnEmpty.addEventListener('click', () => abrirModalCadastro());

    const modalCloseBtn = document.getElementById('modalCloseBtn');
    const btnModalCancel = document.getElementById('btnModalCancel');
    const detailsCloseBtn = document.getElementById('detailsCloseBtn');
    const btnDetailsClose = document.getElementById('btnDetailsClose');
    const vehicleModalOverlay = document.getElementById('vehicleModalOverlay');
    const detailsModalOverlay = document.getElementById('detailsModalOverlay');

    if (modalCloseBtn) modalCloseBtn.addEventListener('click', fecharModalCadastro);
    if (btnModalCancel) btnModalCancel.addEventListener('click', fecharModalCadastro);
    if (detailsCloseBtn) detailsCloseBtn.addEventListener('click', fecharModalDetalhes);
    if (btnDetailsClose) btnDetailsClose.addEventListener('click', fecharModalDetalhes);

    if (vehicleModalOverlay) {
        vehicleModalOverlay.addEventListener('click', (e) => {
            if (e.target === vehicleModalOverlay) fecharModalCadastro();
        });
    }

    if (detailsModalOverlay) {
        detailsModalOverlay.addEventListener('click', (e) => {
            if (e.target === detailsModalOverlay) fecharModalDetalhes();
        });
    }

    const vehicleForm = document.getElementById('vehicleForm');
    if (vehicleForm) {
        vehicleForm.addEventListener('submit', salvarVeiculo);
    }

    const statusPills = document.querySelectorAll('.status-pill');
    statusPills.forEach(pill => {
        pill.addEventListener('click', () => {
            statusPills.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            state.filtroStatus = pill.getAttribute('data-status');
            atualizarSidebarAtiva(state.filtroStatus);
            renderizarVeiculos();
        });
    });

    const navButtons = document.querySelectorAll('.nav-item-btn');
    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            navButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const filter = btn.getAttribute('data-filter-status');
            state.filtroStatus = filter;

            statusPills.forEach(p => {
                p.classList.toggle('active', p.getAttribute('data-status') === filter || (filter === 'Estoque' && p.getAttribute('data-status') === 'Todos'));
            });

            renderizarVeiculos();

            const appSidebar = document.getElementById('appSidebar');
            const sidebarBackdrop = document.getElementById('sidebarBackdrop');
            if (window.innerWidth <= 768 && appSidebar) {
                appSidebar.classList.remove('open');
                if (sidebarBackdrop) sidebarBackdrop.classList.remove('active');
                document.body.style.overflow = '';
            }
        });
    });

    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            state.filtroBusca = e.target.value.toLowerCase().trim();
            renderizarVeiculos();
        });
    }
}

function atualizarSidebarAtiva(status) {
    const navVisaoGeral = document.getElementById('navVisaoGeral');
    const navEstoque = document.getElementById('navEstoque');
    const navVendidos = document.getElementById('navVendidos');

    if (!navVisaoGeral || !navEstoque || !navVendidos) return;

    navVisaoGeral.classList.remove('active');
    navEstoque.classList.remove('active');
    navVendidos.classList.remove('active');

    if (status === 'Todos') {
        navVisaoGeral.classList.add('active');
    } else if (status === 'Vendido') {
        navVendidos.classList.add('active');
    } else {
        navEstoque.classList.add('active');
    }
}

function initCalculationTriggers() {
    const calcInputs = document.querySelectorAll('.calc-trigger');
    calcInputs.forEach(input => {
        input.addEventListener('input', recalcularPrevisoesModal);
    });
}

function recalcularPrevisoesModal() {
    const valorArremate = parseFloat(document.getElementById('inputValorArremate').value) || 0;
    const comissaoPct = parseFloat(document.getElementById('inputComissaoPct').value) || 0;
    const taxasPatio = parseFloat(document.getElementById('inputTaxasPatio').value) || 0;
    const custoGuincho = parseFloat(document.getElementById('inputCustoGuincho').value) || 0;

    const totalAquisicao = valorArremate + (valorArremate * (comissaoPct / 100)) + taxasPatio + custoGuincho;

    const gastoMecanica = parseFloat(document.getElementById('inputGastoMecanica').value) || 0;
    const gastoFunilaria = parseFloat(document.getElementById('inputGastoFunilaria').value) || 0;
    const gastoEstetica = parseFloat(document.getElementById('inputGastoEstetica').value) || 0;
    const gastoDocumentacao = parseFloat(document.getElementById('inputGastoDocumentacao').value) || 0;

    const totalPreparacao = gastoMecanica + gastoFunilaria + gastoEstetica + gastoDocumentacao;
    const custoTotal = totalAquisicao + totalPreparacao;

    const valorVendaInput = document.getElementById('inputValorVenda').value;
    const valorVenda = valorVendaInput !== '' ? parseFloat(valorVendaInput) || 0 : null;

    let lucroBruto = 0;
    let roiPct = 0;

    if (valorVenda !== null && valorVenda > 0) {
        lucroBruto = valorVenda - custoTotal;
        roiPct = custoTotal > 0 ? (lucroBruto / custoTotal) * 100 : 0;
    }

    document.getElementById('previewTotalAquisicao').textContent = formatarMoeda(totalAquisicao);
    document.getElementById('previewTotalPreparacao').textContent = formatarMoeda(totalPreparacao);
    document.getElementById('previewCustoTotal').textContent = formatarMoeda(custoTotal);

    const previewLucro = document.getElementById('previewLucroBruto');
    const previewRoi = document.getElementById('previewRoiPct');

    if (valorVenda !== null && valorVenda > 0) {
        previewLucro.textContent = formatarMoeda(lucroBruto);
        previewRoi.textContent = `${roiPct.toFixed(1)}%`;
        previewLucro.className = `profit-value ${lucroBruto >= 0 ? 'text-income' : 'text-expense'}`;
    } else {
        previewLucro.textContent = 'R$ 0,00';
        previewRoi.textContent = '0.0%';
        previewLucro.className = 'profit-value text-income';
    }
}

async function carregarVeiculos() {
    try {
        const response = await fetch(`${API_BASE}/veiculos`);
        if (!response.ok) throw new Error('API indisponível');
        
        state.veiculos = await response.json();
        state.modoApi = true;
        document.getElementById('dbStatusText').textContent = 'Prisma Conectado';
    } catch (err) {
        console.warn('[AutoLeilão] API offline, utilizando armazenamento local.', err.message);
        state.modoApi = false;
        document.getElementById('dbStatusText').textContent = 'Modo Local (Offline)';
        
        const localData = localStorage.getItem('autoleilao_veiculos');
        if (localData) {
            state.veiculos = JSON.parse(localData);
        } else {
            state.veiculos = [];
            salvarLocal();
        }
    }

    atualizarDashboard();
    renderizarVeiculos();
}

function atualizarDashboard() {
    let lucroTotalAcumulado = 0;
    let capitalInvestidoParado = 0;
    let totalVendidos = 0;
    let totalEstoque = 0;
    let somaRoi = 0;

    state.veiculos.forEach(v => {
        if (v.status === 'Vendido') {
            totalVendidos++;
            if (v.lucroBruto !== null && v.lucroBruto !== undefined) {
                lucroTotalAcumulado += Number(v.lucroBruto);
            }
            if (v.roiPct !== null && v.roiPct !== undefined) {
                somaRoi += Number(v.roiPct);
            }
        } else {
            totalEstoque++;
            capitalInvestidoParado += Number(v.custoTotal || 0);
        }
    });

    const roiMedio = totalVendidos > 0 ? (somaRoi / totalVendidos) : 0;

    document.getElementById('kpiLucroTotal').textContent = formatarMoeda(lucroTotalAcumulado);
    document.getElementById('kpiQtdVendidos').textContent = `${totalVendidos} veículo(s) vendido(s)`;

    document.getElementById('kpiCapitalParado').textContent = formatarMoeda(capitalInvestidoParado);
    document.getElementById('kpiQtdEstoque').textContent = `${totalEstoque} carro(s) ativo(s)`;

    document.getElementById('kpiRoiMedio').textContent = `${roiMedio.toFixed(1)}%`;

    document.getElementById('badgeTotalGeral').textContent = state.veiculos.length;
    document.getElementById('badgeEstoque').textContent = totalEstoque;
    document.getElementById('badgeVendidos').textContent = totalVendidos;
}

function renderizarVeiculos() {
    const grid = document.getElementById('vehiclesGrid');
    const emptyState = document.getElementById('emptyState');
    const sectionCounter = document.getElementById('sectionCounter');

    let filtrados = state.veiculos.filter(v => {
        let matchStatus = true;
        if (state.filtroStatus === 'Estoque') {
            matchStatus = v.status !== 'Vendido';
        } else if (state.filtroStatus !== 'Todos') {
            matchStatus = v.status === state.filtroStatus;
        }

        let matchBusca = true;
        if (state.filtroBusca) {
            const texto = `${v.marca} ${v.modelo} ${v.placa || ''} ${v.origem || ''}`.toLowerCase();
            matchBusca = texto.includes(state.filtroBusca);
        }

        return matchStatus && matchBusca;
    });

    sectionCounter.textContent = `Exibindo ${filtrados.length} de ${state.veiculos.length} veículos`;

    if (filtrados.length === 0) {
        grid.innerHTML = '';
        emptyState.style.display = 'flex';
        return;
    }

    emptyState.style.display = 'none';
    grid.innerHTML = filtrados.map(v => criarCardVeiculoHTML(v)).join('');

    document.querySelectorAll('.btn-view-details').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            abrirModalDetalhes(id);
        });
    });

    document.querySelectorAll('.btn-edit-car').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            abrirModalEdicao(id);
        });
    });

    document.querySelectorAll('.btn-delete-car').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            confirmarExclusao(id);
        });
    });
}

function criarCardVeiculoHTML(v) {
    const statusClass = {
        'Em Trânsito': 'status-transito',
        'Em Preparação': 'status-preparacao',
        'Regularização': 'status-regularizacao',
        'Anunciado': 'status-anunciado',
        'Vendido': 'status-vendido'
    }[v.status] || 'status-transito';

    const isVendido = v.status === 'Vendido';
    const lucro = v.lucroBruto !== null && v.lucroBruto !== undefined ? Number(v.lucroBruto) : null;
    const roi = v.roiPct !== null && v.roiPct !== undefined ? Number(v.roiPct) : null;

    return `
        <article class="car-card" id="carCard-${v.id}">
            <header class="car-card-header">
                <div class="car-title-block">
                    <h3 class="car-model-name">${escapeHTML(v.marca)} ${escapeHTML(v.modelo)}</h3>
                    <div class="car-meta-tags">
                        <span class="car-tag">${v.ano}</span>
                        ${v.placa ? `<span class="car-tag tag-placa">${escapeHTML(v.placa)}</span>` : ''}
                        <span class="car-tag">${escapeHTML(v.origem || 'Leilão')}</span>
                    </div>
                </div>
                <span class="status-badge ${statusClass}">${escapeHTML(v.status)}</span>
            </header>

            <div class="car-card-body">
                <div class="cost-row-summary">
                    <div class="cost-col">
                        <span class="cost-label">Aquisição (Leilão)</span>
                        <span class="cost-value">${formatarMoeda(v.totalAquisicao || 0)}</span>
                    </div>
                    <div class="cost-col">
                        <span class="cost-label">Reforma / Docs</span>
                        <span class="cost-value">${formatarMoeda(v.totalPreparacao || 0)}</span>
                    </div>
                </div>

                <div class="total-accumulated-box">
                    <span class="total-label">Custo Total Investido:</span>
                    <span class="total-value">${formatarMoeda(v.custoTotal || 0)}</span>
                </div>

                <div class="sale-result-box">
                    ${isVendido ? `
                        <div class="sale-metrics-grid">
                            <div class="sale-metric-item">
                                <span class="sale-metric-label">Valor de Venda:</span>
                                <span class="sale-metric-val">${formatarMoeda(v.valorVenda || 0)}</span>
                            </div>
                            <div class="sale-metric-item">
                                <span class="sale-metric-label">Lucro Bruto:</span>
                                <span class="sale-metric-val ${lucro >= 0 ? 'text-income' : 'text-expense'}">
                                    ${formatarMoeda(lucro || 0)}
                                </span>
                            </div>
                        </div>
                        <div class="sale-metrics-grid" style="margin-top: 4px;">
                            <div class="sale-metric-item">
                                <span class="sale-metric-label">Retorno (ROI):</span>
                                <span class="sale-metric-val text-accent">${roi !== null ? roi.toFixed(1) + '%' : 'N/A'}</span>
                            </div>
                            <div class="sale-metric-item">
                                <span class="sale-metric-label">Data da Venda:</span>
                                <span class="sale-metric-val" style="font-size: 0.85rem;">${v.dataVenda ? formatarData(v.dataVenda) : 'Registrada'}</span>
                            </div>
                        </div>
                    ` : `
                        <div class="sale-metrics-grid">
                            <div class="sale-metric-item">
                                <span class="sale-metric-label">Preço de Anúncio:</span>
                                <span class="sale-metric-val text-accent">${v.precoAnuncio ? formatarMoeda(v.precoAnuncio) : 'Não anunciado'}</span>
                            </div>
                            <div class="sale-metric-item">
                                <span class="sale-metric-label">Lucro Estimado:</span>
                                <span class="sale-metric-val text-income">
                                    ${v.precoAnuncio && v.precoAnuncio > v.custoTotal ? formatarMoeda(v.precoAnuncio - v.custoTotal) : '--'}
                                </span>
                            </div>
                        </div>
                    `}
                </div>
            </div>

            <footer class="car-card-footer">
                <button class="btn-card-action btn-view-details" data-id="${v.id}" title="Ver Extrato Analítico">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="16" x2="12" y2="12"></line>
                        <line x1="12" y1="8" x2="12.01" y2="8"></line>
                    </svg>
                    <span>Extrato</span>
                </button>

                <div style="display: flex; gap: 6px;">
                    <button class="btn-card-action btn-edit-car" data-id="${v.id}" title="Editar Despesas">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M12 20h9"></path>
                            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                        </svg>
                        <span>Editar</span>
                    </button>

                    <button class="btn-card-action btn-card-delete btn-delete-car" data-id="${v.id}" title="Excluir Veículo">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                </div>
            </footer>
        </article>
    `;
}

function abrirModalCadastro() {
    state.veiculoEmEdicao = null;
    document.getElementById('modalTitle').textContent = 'Cadastrar Novo Veículo';
    document.getElementById('formVehicleId').value = '';
    document.getElementById('vehicleForm').reset();
    
    document.getElementById('inputAno').value = new Date().getFullYear();
    document.getElementById('inputComissaoPct').value = 5;
    document.getElementById('inputStatus').value = 'Em Trânsito';
    document.getElementById('inputTaxasPatio').value = 0;
    document.getElementById('inputCustoGuincho').value = 0;
    document.getElementById('inputGastoMecanica').value = 0;
    document.getElementById('inputGastoFunilaria').value = 0;
    document.getElementById('inputGastoEstetica').value = 0;
    document.getElementById('inputGastoDocumentacao').value = 0;

    recalcularPrevisoesModal();
    document.getElementById('vehicleModalOverlay').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function abrirModalEdicao(id) {
    const veiculo = state.veiculos.find(v => String(v.id) === String(id));
    if (!veiculo) return;

    state.veiculoEmEdicao = veiculo;
    document.getElementById('modalTitle').textContent = `Editar: ${veiculo.marca} ${veiculo.modelo}`;
    document.getElementById('formVehicleId').value = veiculo.id;

    document.getElementById('inputMarca').value = veiculo.marca || '';
    document.getElementById('inputModelo').value = veiculo.modelo || '';
    document.getElementById('inputAno').value = veiculo.ano || new Date().getFullYear();
    document.getElementById('inputPlaca').value = veiculo.placa || '';
    document.getElementById('inputChassi').value = veiculo.chassi || '';
    document.getElementById('inputOrigem').value = veiculo.origem || 'Seguradora';
    document.getElementById('inputStatus').value = veiculo.status || 'Em Trânsito';
    document.getElementById('inputObservacoes').value = veiculo.observacoes || '';

    document.getElementById('inputValorArremate').value = veiculo.valorArremate || 0;
    document.getElementById('inputComissaoPct').value = veiculo.comissaoPct || 5;
    document.getElementById('inputTaxasPatio').value = veiculo.taxasPatio || 0;
    document.getElementById('inputCustoGuincho').value = veiculo.custoGuincho || 0;

    document.getElementById('inputGastoMecanica').value = veiculo.gastoMecanica || 0;
    document.getElementById('inputGastoFunilaria').value = veiculo.gastoFunilaria || 0;
    document.getElementById('inputGastoEstetica').value = veiculo.gastoEstetica || 0;
    document.getElementById('inputGastoDocumentacao').value = veiculo.gastoDocumentacao || 0;

    document.getElementById('inputPrecoAnuncio').value = veiculo.precoAnuncio || '';
    document.getElementById('inputValorVenda').value = veiculo.valorVenda || '';
    
    if (veiculo.dataVenda) {
        const d = new Date(veiculo.dataVenda);
        document.getElementById('inputDataVenda').value = d.toISOString().split('T')[0];
    } else {
        document.getElementById('inputDataVenda').value = '';
    }

    recalcularPrevisoesModal();
    document.getElementById('vehicleModalOverlay').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function fecharModalCadastro() {
    document.getElementById('vehicleModalOverlay').classList.remove('active');
    document.body.style.overflow = '';
}

async function salvarVeiculo(e) {
    e.preventDefault();

    const id = document.getElementById('formVehicleId').value;
    const valorArremate = parseFloat(document.getElementById('inputValorArremate').value) || 0;
    const comissaoPct = parseFloat(document.getElementById('inputComissaoPct').value) || 0;
    const taxasPatio = parseFloat(document.getElementById('inputTaxasPatio').value) || 0;
    const custoGuincho = parseFloat(document.getElementById('inputCustoGuincho').value) || 0;
    const totalAquisicao = valorArremate + (valorArremate * (comissaoPct / 100)) + taxasPatio + custoGuincho;

    const gastoMecanica = parseFloat(document.getElementById('inputGastoMecanica').value) || 0;
    const gastoFunilaria = parseFloat(document.getElementById('inputGastoFunilaria').value) || 0;
    const gastoEstetica = parseFloat(document.getElementById('inputGastoEstetica').value) || 0;
    const gastoDocumentacao = parseFloat(document.getElementById('inputGastoDocumentacao').value) || 0;
    const totalPreparacao = gastoMecanica + gastoFunilaria + gastoEstetica + gastoDocumentacao;

    const custoTotal = totalAquisicao + totalPreparacao;

    const precoAnuncioVal = document.getElementById('inputPrecoAnuncio').value;
    const precoAnuncio = precoAnuncioVal !== '' ? parseFloat(precoAnuncioVal) : null;

    const valorVendaVal = document.getElementById('inputValorVenda').value;
    const valorVenda = valorVendaVal !== '' ? parseFloat(valorVendaVal) : null;

    const dataVendaVal = document.getElementById('inputDataVenda').value;

    let lucroBruto = null;
    let roiPct = null;

    if (valorVenda !== null && valorVenda > 0) {
        lucroBruto = valorVenda - custoTotal;
        roiPct = custoTotal > 0 ? (lucroBruto / custoTotal) * 100 : 0;
    }

    const payload = {
        marca: document.getElementById('inputMarca').value.trim(),
        modelo: document.getElementById('inputModelo').value.trim(),
        ano: parseInt(document.getElementById('inputAno').value, 10),
        placa: document.getElementById('inputPlaca').value.trim().toUpperCase() || null,
        chassi: document.getElementById('inputChassi').value.trim().toUpperCase() || null,
        origem: document.getElementById('inputOrigem').value,
        status: document.getElementById('inputStatus').value,
        observacoes: document.getElementById('inputObservacoes').value.trim() || null,
        valorArremate,
        comissaoPct,
        taxasPatio,
        custoGuincho,
        totalAquisicao,
        gastoMecanica,
        gastoFunilaria,
        gastoEstetica,
        gastoDocumentacao,
        totalPreparacao,
        custoTotal,
        precoAnuncio,
        valorVenda,
        dataVenda: dataVendaVal ? new Date(dataVendaVal) : null,
        lucroBruto,
        roiPct
    };

    try {
        if (state.modoApi) {
            const url = id ? `${API_BASE}/veiculos/${id}` : `${API_BASE}/veiculos`;
            const method = id ? 'PUT' : 'POST';

            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error('Falha ao salvar no banco');
        } else {
            if (id) {
                const index = state.veiculos.findIndex(v => String(v.id) === String(id));
                if (index !== -1) {
                    state.veiculos[index] = { ...state.veiculos[index], ...payload, updatedAt: new Date() };
                }
            } else {
                const novoId = state.veiculos.length > 0 ? Math.max(...state.veiculos.map(v => Number(v.id) || 0)) + 1 : 1;
                state.veiculos.unshift({ id: novoId, ...payload, createdAt: new Date(), updatedAt: new Date() });
            }
            salvarLocal();
        }

        fecharModalCadastro();
        await carregarVeiculos();

    } catch (err) {
        console.error('Erro ao salvar:', err);
        alert('Erro ao salvar veículo. Verifique se o servidor backend está em execução.');
    }
}

async function confirmarExclusao(id) {
    const veiculo = state.veiculos.find(v => String(v.id) === String(id));
    if (!veiculo) return;

    const confirmou = confirm(`Tem certeza que deseja excluir o veículo "${veiculo.marca} ${veiculo.modelo}"?`);
    if (!confirmou) return;

    try {
        if (state.modoApi) {
            const response = await fetch(`${API_BASE}/veiculos/${id}`, { method: 'DELETE' });
            if (!response.ok) throw new Error('Erro ao excluir no banco');
        } else {
            state.veiculos = state.veiculos.filter(v => String(v.id) !== String(id));
            salvarLocal();
        }

        await carregarVeiculos();
    } catch (err) {
        console.error('Erro na exclusão:', err);
        alert('Erro ao excluir veículo do banco.');
    }
}

function abrirModalDetalhes(id) {
    const v = state.veiculos.find(item => String(item.id) === String(id));
    if (!v) return;

    document.getElementById('detailsTitle').textContent = `${v.marca} ${v.modelo} (${v.ano})`;
    document.getElementById('detailsSubtitle').textContent = `Placa: ${v.placa || 'Sem placa'} | Origem: ${v.origem || 'Leilão'} | Status: ${v.status}`;

    const valorComissaoRS = (v.valorArremate || 0) * ((v.comissaoPct || 5) / 100);

    const html = `
        <div class="details-grid-cards">
            
            <div class="details-card">
                <h4 class="details-card-title">1. Custos de Aquisição no Leilão</h4>
                <table class="details-table">
                    <tr><td>Valor do Lance (Arremate):</td><td>${formatarMoeda(v.valorArremate || 0)}</td></tr>
                    <tr><td>Comissão Leiloeiro (${v.comissaoPct || 5}%):</td><td>${formatarMoeda(valorComissaoRS)}</td></tr>
                    <tr><td>Taxas Administrativas / Pátio:</td><td>${formatarMoeda(v.taxasPatio || 0)}</td></tr>
                    <tr><td>Custo do Guincho:</td><td>${formatarMoeda(v.custoGuincho || 0)}</td></tr>
                    <tr style="border-top: 1px solid var(--border-color);">
                        <td><strong style="color: var(--text-main);">Subtotal Aquisição:</strong></td>
                        <td><strong style="color: var(--accent-color);">${formatarMoeda(v.totalAquisicao || 0)}</strong></td>
                    </tr>
                </table>
            </div>

            <div class="details-card">
                <h4 class="details-card-title">2. Gastos de Reforma e Regularização</h4>
                <table class="details-table">
                    <tr><td>Oficina / Mecânica:</td><td>${formatarMoeda(v.gastoMecanica || 0)}</td></tr>
                    <tr><td>Funilaria e Pintura:</td><td>${formatarMoeda(v.gastoFunilaria || 0)}</td></tr>
                    <tr><td>Estética / Higienização:</td><td>${formatarMoeda(v.gastoEstetica || 0)}</td></tr>
                    <tr><td>Detran / IPVA / Multas:</td><td>${formatarMoeda(v.gastoDocumentacao || 0)}</td></tr>
                    <tr style="border-top: 1px solid var(--border-color);">
                        <td><strong style="color: var(--text-main);">Subtotal Preparação:</strong></td>
                        <td><strong style="color: var(--accent-color);">${formatarMoeda(v.totalPreparacao || 0)}</strong></td>
                    </tr>
                </table>
            </div>

        </div>

        <div class="form-group-card highlight-card">
            <h4 class="details-card-title" style="color: var(--text-main); font-size: 1rem;">
                3. Balanço Financeiro Acumulado
            </h4>
            <div class="profit-preview-box">
                <div class="profit-item">
                    <span class="profit-label">Custo Total Investido</span>
                    <strong class="profit-value">${formatarMoeda(v.custoTotal || 0)}</strong>
                </div>
                <div class="profit-item">
                    <span class="profit-label">${v.status === 'Vendido' ? 'Valor Final de Venda' : 'Preço de Anúncio'}</span>
                    <strong class="profit-value text-accent">${formatarMoeda(v.status === 'Vendido' ? (v.valorVenda || 0) : (v.precoAnuncio || 0))}</strong>
                </div>
                <div class="profit-item">
                    <span class="profit-label">${v.status === 'Vendido' ? 'Lucro Bruto Realizado' : 'Lucro Potencial'}</span>
                    <strong class="profit-value ${v.lucroBruto >= 0 ? 'text-income' : 'text-expense'}">
                        ${v.status === 'Vendido' ? formatarMoeda(v.lucroBruto || 0) : (v.precoAnuncio ? formatarMoeda(v.precoAnuncio - v.custoTotal) : 'N/A')}
                    </strong>
                </div>
                <div class="profit-item">
                    <span class="profit-label">Retorno % (ROI)</span>
                    <strong class="profit-value text-accent">
                        ${v.status === 'Vendido' && v.roiPct !== null ? v.roiPct.toFixed(1) + '%' : (v.precoAnuncio && v.custoTotal > 0 ? (((v.precoAnuncio - v.custoTotal) / v.custoTotal) * 100).toFixed(1) + '%' : 'N/A')}
                    </strong>
                </div>
            </div>
            ${v.observacoes ? `
                <div style="margin-top: 10px; font-size: 0.85rem; color: var(--text-sub);">
                    <strong>Observações:</strong> ${escapeHTML(v.observacoes)}
                </div>
            ` : ''}
        </div>
    `;

    document.getElementById('detailsBody').innerHTML = html;

    const btnEdit = document.getElementById('btnDetailsEdit');
    if (btnEdit) {
        btnEdit.onclick = () => {
            fecharModalDetalhes();
            abrirModalEdicao(id);
        };
    }

    document.getElementById('detailsModalOverlay').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function fecharModalDetalhes() {
    document.getElementById('detailsModalOverlay').classList.remove('active');
    document.body.style.overflow = '';
}

function formatarMoeda(valor) {
    const num = Number(valor) || 0;
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatarData(dataISO) {
    if (!dataISO) return '';
    try {
        const d = new Date(dataISO);
        return d.toLocaleDateString('pt-BR');
    } catch {
        return '';
    }
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

function salvarLocal() {
    localStorage.setItem('autoleilao_veiculos', JSON.stringify(state.veiculos));
}
