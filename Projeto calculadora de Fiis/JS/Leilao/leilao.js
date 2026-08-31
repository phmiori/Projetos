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

    const vendaCloseBtn = document.getElementById('vendaCloseBtn');
    const btnVendaCancel = document.getElementById('btnVendaCancel');
    const vendaModalOverlay = document.getElementById('vendaModalOverlay');
    const vendaForm = document.getElementById('vendaForm');

    if (modalCloseBtn) modalCloseBtn.addEventListener('click', fecharModalCadastro);
    if (btnModalCancel) btnModalCancel.addEventListener('click', fecharModalCadastro);
    if (detailsCloseBtn) detailsCloseBtn.addEventListener('click', fecharModalDetalhes);
    if (btnDetailsClose) btnDetailsClose.addEventListener('click', fecharModalDetalhes);

    if (vendaCloseBtn) vendaCloseBtn.addEventListener('click', fecharModalVenda);
    if (btnVendaCancel) btnVendaCancel.addEventListener('click', fecharModalVenda);
    if (vendaForm) vendaForm.addEventListener('submit', salvarVendaRapida);

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

    if (vendaModalOverlay) {
        vendaModalOverlay.addEventListener('click', (e) => {
            if (e.target === vendaModalOverlay) fecharModalVenda();
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
            renderizarVeiculos();
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

function initCalculationTriggers() {
    const calcInputs = document.querySelectorAll('.calc-trigger');
    calcInputs.forEach(input => {
        input.addEventListener('input', recalcularPrevisoesModal);
        input.addEventListener('change', recalcularPrevisoesModal);
    });
}

function calcularPagamento(valorArremate, metodoPagamento) {
    const valorEntrada = metodoPagamento === 'Parcelado' ? valorArremate * 0.25 : 0;
    const valorParcelado = metodoPagamento === 'Parcelado' ? valorArremate - valorEntrada : 0;
    return { valorEntrada, valorParcelado };
}

function recalcularPrevisoesModal() {
    const valorArremate = parseFloat(document.getElementById('inputValorArremate').value) || 0;
    const comissaoPct = parseFloat(document.getElementById('inputComissaoPct').value) || 0;
    const taxasPatio = parseFloat(document.getElementById('inputTaxasPatio').value) || 0;
    const custoGuincho = parseFloat(document.getElementById('inputCustoGuincho').value) || 0;

    const totalAquisicao = valorArremate + (valorArremate * (comissaoPct / 100)) + taxasPatio + custoGuincho;

    const metodoPagamento = document.getElementById('inputMetodoPagamento').value;
    const { valorEntrada, valorParcelado } = calcularPagamento(valorArremate, metodoPagamento);

    const paymentPreviewBox = document.getElementById('paymentPreviewBox');
    if (metodoPagamento === 'Parcelado') {
        paymentPreviewBox.style.display = 'flex';
        document.getElementById('previewValorEntrada').textContent = formatarMoeda(valorEntrada);
        document.getElementById('previewValorParcelado').textContent = formatarMoeda(valorParcelado);
    } else {
        paymentPreviewBox.style.display = 'none';
    }

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

    const badgeLeilaoCount = document.getElementById('badgeLeilaoCount');
    if (badgeLeilaoCount) badgeLeilaoCount.textContent = state.veiculos.length;
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
                        <span class="car-tag tag-pagamento">${v.metodoPagamento === 'Parcelado' ? 'Parcelado' : 'À Vista'}</span>
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
                <button class="btn-card-action btn-view-details" data-id="${v.id}" title="Ver Planilha de Gastos e Serviços">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect width="20" height="14" x="2" y="5" rx="2"></rect>
                        <line x1="2" y1="10" x2="22" y2="10"></line>
                    </svg>
                    <span>Gastos & Planilha</span>
                </button>

                <div style="display: flex; gap: 6px;">
                    <button class="btn-card-action btn-edit-car" data-id="${v.id}" title="Editar Dados do Veículo">
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
    document.getElementById('inputMetodoPagamento').value = 'À Vista';
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
    document.getElementById('modalTitle').textContent = `Editar Dados: ${veiculo.marca} ${veiculo.modelo}`;
    document.getElementById('formVehicleId').value = veiculo.id;

    document.getElementById('inputMarca').value = veiculo.marca || '';
    document.getElementById('inputModelo').value = veiculo.modelo || '';
    document.getElementById('inputAno').value = veiculo.ano || new Date().getFullYear();
    document.getElementById('inputPlaca').value = veiculo.placa || '';
    document.getElementById('inputChassi').value = veiculo.chassi || '';
    document.getElementById('inputLeiloeiro').value = veiculo.leiloeiro || '';
    
    if (veiculo.dataCompra) {
        const d = new Date(veiculo.dataCompra);
        document.getElementById('inputDataCompra').value = d.toISOString().split('T')[0];
    } else {
        document.getElementById('inputDataCompra').value = '';
    }

    document.getElementById('inputOrigem').value = veiculo.origem || 'Seguradora';
    document.getElementById('inputStatus').value = veiculo.status || 'Em Trânsito';
    document.getElementById('inputObservacoes').value = veiculo.observacoes || '';

    document.getElementById('inputValorArremate').value = veiculo.valorArremate || 0;
    document.getElementById('inputComissaoPct').value = veiculo.comissaoPct || 5;
    document.getElementById('inputMetodoPagamento').value = veiculo.metodoPagamento || 'À Vista';
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

    const metodoPagamento = document.getElementById('inputMetodoPagamento').value;
    const { valorEntrada, valorParcelado } = calcularPagamento(valorArremate, metodoPagamento);

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
    const dataCompraVal = document.getElementById('inputDataCompra').value;

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
        leiloeiro: document.getElementById('inputLeiloeiro').value.trim() || null,
        dataCompra: dataCompraVal ? new Date(dataCompraVal) : null,
        origem: document.getElementById('inputOrigem').value,
        status: document.getElementById('inputStatus').value,
        observacoes: document.getElementById('inputObservacoes').value.trim() || null,
        valorArremate,
        comissaoPct,
        taxasPatio,
        custoGuincho,
        totalAquisicao,
        metodoPagamento,
        valorEntrada,
        valorParcelado,
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
                state.veiculos.unshift({ id: novoId, ...payload, gastos: [], createdAt: new Date(), updatedAt: new Date() });
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

/**
 * Renderiza o Extrato Completo e Planilha de Gastos (Design da Imagem de Referência)
 */
function abrirModalDetalhes(id) {
    const v = state.veiculos.find(item => String(item.id) === String(id));
    if (!v) return;

    document.getElementById('detailsTitle').textContent = `${v.marca} ${v.modelo}`;
    document.getElementById('detailsSubtitle').textContent = `Placa: ${v.placa || 'Sem placa'} | Ano: ${v.ano} | Status: ${v.status}`;

    const gastos = v.gastos || [];
    let totalGastosPlanilha = 0;
    gastos.forEach(g => {
        totalGastosPlanilha += (Number(g.valor) || 0);
    });

    const isVendido = v.status === 'Vendido';
    const lucroExibido = isVendido 
        ? (v.lucroBruto !== null ? v.lucroBruto : (v.valorVenda ? v.valorVenda - v.custoTotal : 0))
        : (v.precoAnuncio ? v.precoAnuncio - v.custoTotal : 0);

    const statusBadgeClass = isVendido ? 'status-vendido-tag' : (v.status === 'Anunciado' ? 'status-venda' : 'status-preparando');
    const statusTexto = isVendido ? 'VENDIDO' : (v.status === 'Anunciado' ? 'À VENDA' : v.status.toUpperCase());

    const hojeStr = new Date().toISOString().split('T')[0];

    const html = `
        <!-- 1. Header do Veículo com Indicadores -->
        <div class="expense-vehicle-header">
            <div class="expense-header-top">
                <div class="expense-vehicle-title-wrap">
                    <h2 class="expense-vehicle-name">${escapeHTML(v.marca)} ${escapeHTML(v.modelo)}</h2>
                    <span class="status-badge-inline ${statusBadgeClass}">${statusTexto}</span>
                </div>
            </div>
            <div class="expense-vehicle-meta">
                <span>Ano: <strong>${v.ano}/${v.ano}</strong></span>
                <span>Placa: <strong>${v.placa ? escapeHTML(v.placa) : 'Não emplacado'}</strong></span>
                <span>Leiloeiro / Origem: <strong>${escapeHTML(v.leiloeiro || v.origem || 'Leilão')}</strong></span>
                <span>Compra: <strong>${v.dataCompra ? formatarData(v.dataCompra) : (v.createdAt ? formatarData(v.createdAt) : '--')}</strong></span>
            </div>

            <!-- 4 Cards de Métricas -->
            <div class="expense-kpis-grid">
                <div class="expense-kpi-box">
                    <span class="expense-kpi-label">Lance / Arrematação</span>
                    <span class="expense-kpi-val">${formatarMoeda(v.valorArremate || 0)}</span>
                </div>
                <div class="expense-kpi-box">
                    <span class="expense-kpi-label">Gastos na Planilha</span>
                    <span class="expense-kpi-val accent">${formatarMoeda(totalGastosPlanilha > 0 ? totalGastosPlanilha : v.totalPreparacao + (v.taxasPatio || 0) + (v.custoGuincho || 0))}</span>
                </div>
                <div class="expense-kpi-box">
                    <span class="expense-kpi-label">Custo Total do Carro</span>
                    <span class="expense-kpi-val accent">${formatarMoeda(v.custoTotal || 0)}</span>
                </div>
                <div class="expense-kpi-box highlight">
                    <span class="expense-kpi-label">${isVendido ? 'Lucro Realizado (Venda)' : 'Lucro Estimado (Anúncio)'}</span>
                    <span class="expense-kpi-val ${lucroExibido >= 0 ? 'income' : 'expense'}">${formatarMoeda(lucroExibido)}</span>
                </div>
                <div class="expense-kpi-box">
                    <span class="expense-kpi-label">Método de Arrematação</span>
                    <span class="expense-kpi-val accent">${v.metodoPagamento === 'Parcelado' ? 'Parcelado' : 'À Vista'}</span>
                </div>
                ${v.metodoPagamento === 'Parcelado' ? `
                <div class="expense-kpi-box">
                    <span class="expense-kpi-label">Entrada Paga (25%, sem comissão)</span>
                    <span class="expense-kpi-val">${formatarMoeda(v.valorEntrada || 0)}</span>
                </div>
                <div class="expense-kpi-box">
                    <span class="expense-kpi-label">Saldo Parcelado (75%)</span>
                    <span class="expense-kpi-val">${formatarMoeda(v.valorParcelado || 0)}</span>
                </div>
                ` : ''}
            </div>
        </div>

        <!-- 2. Formulário Horizontal de Lançamento de Novo Gasto -->
        <div class="expense-form-card">
            <h3 class="expense-form-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                <span>Lançar Novo Gasto / Serviço Realizado</span>
            </h3>

            <form id="formNovoGasto" data-veiculo-id="${v.id}">
                <div class="expense-inputs-bar">
                    <input type="date" id="gastoInputData" class="input-missao" value="${hojeStr}" required title="Data do serviço ou taxa">
                    
                    <select id="gastoInputCategoria" class="input-missao" required>
                        <option value="Taxa Leiloeiro / Pátio">Taxa Leilão / Pátio</option>
                        <option value="Guincho">Guincho</option>
                        <option value="Mecânica" selected>Mecânica</option>
                        <option value="Funilaria / Pintura">Funilaria / Pintura</option>
                        <option value="Documentação">Documentação</option>
                        <option value="Estética / Higienização">Estética / Higienização</option>
                        <option value="Outros">Outros</option>
                    </select>

                    <input type="text" id="gastoInputDescricao" class="input-missao" placeholder="O que foi feito? (Ex: Troca de óleo e pastilhas)" required>
                    
                    <input type="text" id="gastoInputOficina" class="input-missao" placeholder="Oficina / Loja (Ex: Mecânica Silva)">
                    
                    <input type="number" id="gastoInputValor" class="input-missao" step="0.01" min="0" placeholder="R$ 0,00" required>
                    
                    <button type="submit" class="btn-lancar-gasto">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <rect width="20" height="14" x="2" y="5" rx="2"></rect>
                            <line x1="2" y1="10" x2="22" y2="10"></line>
                        </svg>
                        <span>Lançar</span>
                    </button>
                </div>
            </form>
        </div>

        <!-- 3. Planilha de Gastos e Serviços do Veículo -->
        <div class="expense-table-container">
            <div class="expense-table-header">
                <h3 class="expense-table-title">Planilha de Gastos & Serviços do Veículo</h3>
                <div class="expense-table-actions">
                    <button type="button" class="btn-export-csv" id="btnExportarCsv" data-id="${v.id}">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="7 10 12 15 17 10"></polyline>
                            <line x1="12" y1="15" x2="12" y2="3"></line>
                        </svg>
                        <span>Exportar Planilha (CSV)</span>
                    </button>

                    <button type="button" class="btn-mark-sold" id="btnMarcarVendido" data-id="${v.id}">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="12" y1="1" x2="12" y2="23"></line>
                            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                        </svg>
                        <span>Marcar como Vendido / Preço</span>
                    </button>
                </div>
            </div>

            <div class="expense-table-wrapper">
                <table class="expense-data-table">
                    <thead>
                        <tr>
                            <th style="width: 40px;">#</th>
                            <th style="width: 110px;">DATA</th>
                            <th style="width: 160px;">CATEGORIA</th>
                            <th>DESCRIÇÃO DO QUE FOI FEITO</th>
                            <th style="width: 200px;">OFICINA / FORNECEDOR</th>
                            <th style="width: 140px; text-align: right;">VALOR (R$)</th>
                            <th style="width: 60px; text-align: center;">EXCLUIR</th>
                        </tr>
                    </thead>
                    <tbody id="expenseTableBody">
                        ${renderizarLinhasGastos(gastos, v)}
                    </tbody>
                </table>
            </div>

            <div class="expense-table-footer">
                <span class="expense-footer-label">TOTAL DE GASTOS NA PLANILHA:</span>
                <span class="expense-footer-total">${formatarMoeda(totalGastosPlanilha > 0 ? totalGastosPlanilha : v.totalPreparacao + (v.taxasPatio || 0) + (v.custoGuincho || 0))}</span>
            </div>
        </div>
    `;

    document.getElementById('detailsBody').innerHTML = html;

    // Vincular Eventos do Extrato de Gastos
    const formNovoGasto = document.getElementById('formNovoGasto');
    if (formNovoGasto) {
        formNovoGasto.addEventListener('submit', async (e) => {
            e.preventDefault();
            await adicionarNovoGasto(v.id);
        });
    }

    const btnExportarCsv = document.getElementById('btnExportarCsv');
    if (btnExportarCsv) {
        btnExportarCsv.addEventListener('click', () => exportarPlanilhaCsv(v));
    }

    const btnMarcarVendido = document.getElementById('btnMarcarVendido');
    if (btnMarcarVendido) {
        btnMarcarVendido.addEventListener('click', () => abrirModalVenda(v));
    }

    const btnEdit = document.getElementById('btnDetailsEdit');
    if (btnEdit) {
        btnEdit.onclick = () => {
            fecharModalDetalhes();
            abrirModalEdicao(id);
        };
    }

    // Vincular eventos de exclusão de gastos
    vincularEventosExclusaoGasto(v.id);

    document.getElementById('detailsModalOverlay').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function renderizarLinhasGastos(gastos, v) {
    if (!gastos || gastos.length === 0) {
        // Se ainda não tiver registros detalhados na tabela, cria linhas base dos custos fixos informados
        const linhasIniciais = [];
        let index = 1;

        if (v.taxasPatio > 0) {
            linhasIniciais.push(`
                <tr>
                    <td>${index++}</td>
                    <td>${v.dataCompra ? formatarData(v.dataCompra) : formatarData(v.createdAt)}</td>
                    <td><span class="cat-badge cat-leilao">TAXA LEILOEIRO</span></td>
                    <td>Taxa administrativa e estadia do lote</td>
                    <td>${escapeHTML(v.leiloeiro || 'Pátio')}</td>
                    <td style="text-align: right; font-weight: 700;">${formatarMoeda(v.taxasPatio)}</td>
                    <td style="text-align: center;">--</td>
                </tr>
            `);
        }

        if (v.custoGuincho > 0) {
            linhasIniciais.push(`
                <tr>
                    <td>${index++}</td>
                    <td>${v.dataCompra ? formatarData(v.dataCompra) : formatarData(v.createdAt)}</td>
                    <td><span class="cat-badge cat-guincho">GUINCHO</span></td>
                    <td>Frete e transporte do pátio até oficina</td>
                    <td>Transporte Guincho</td>
                    <td style="text-align: right; font-weight: 700;">${formatarMoeda(v.custoGuincho)}</td>
                    <td style="text-align: center;">--</td>
                </tr>
            `);
        }

        if (v.gastoMecanica > 0) {
            linhasIniciais.push(`
                <tr>
                    <td>${index++}</td>
                    <td>${v.createdAt ? formatarData(v.createdAt) : '--'}</td>
                    <td><span class="cat-badge cat-mecanica">MECÂNICA</span></td>
                    <td>Revisão e manutenção mecânica geral</td>
                    <td>Oficina Mecânica</td>
                    <td style="text-align: right; font-weight: 700;">${formatarMoeda(v.gastoMecanica)}</td>
                    <td style="text-align: center;">--</td>
                </tr>
            `);
        }

        if (v.gastoFunilaria > 0) {
            linhasIniciais.push(`
                <tr>
                    <td>${index++}</td>
                    <td>${v.createdAt ? formatarData(v.createdAt) : '--'}</td>
                    <td><span class="cat-badge cat-funilaria">FUNILARIA / PINTURA</span></td>
                    <td>Reparos de lataria e pintura</td>
                    <td>Oficina de Pintura</td>
                    <td style="text-align: right; font-weight: 700;">${formatarMoeda(v.gastoFunilaria)}</td>
                    <td style="text-align: center;">--</td>
                </tr>
            `);
        }

        if (v.gastoDocumentacao > 0) {
            linhasIniciais.push(`
                <tr>
                    <td>${index++}</td>
                    <td>${v.createdAt ? formatarData(v.createdAt) : '--'}</td>
                    <td><span class="cat-badge cat-documentacao">DOCUMENTAÇÃO</span></td>
                    <td>Transferência, taxas Detran e laudos</td>
                    <td>Despachante</td>
                    <td style="text-align: right; font-weight: 700;">${formatarMoeda(v.gastoDocumentacao)}</td>
                    <td style="text-align: center;">--</td>
                </tr>
            `);
        }

        if (linhasIniciais.length > 0) {
            return linhasIniciais.join('');
        }

        return `
            <tr>
                <td colspan="7" style="text-align: center; padding: 24px; color: var(--text-sub);">
                    Nenhum gasto lançado para este veículo ainda. Use o formulário acima para lançar serviços!
                </td>
            </tr>
        `;
    }

    return gastos.map((g, idx) => {
        const catClass = getCategoryBadgeClass(g.categoria);
        return `
            <tr>
                <td>${idx + 1}</td>
                <td>${formatarData(g.data)}</td>
                <td><span class="cat-badge ${catClass}">${escapeHTML(g.categoria)}</span></td>
                <td>${escapeHTML(g.descricao)}</td>
                <td>${g.oficina ? escapeHTML(g.oficina) : '--'}</td>
                <td style="text-align: right; font-weight: 700;">${formatarMoeda(g.valor)}</td>
                <td style="text-align: center;">
                    <button class="btn-delete-expense-row" data-gasto-id="${g.id}" title="Excluir Lançamento">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function getCategoryBadgeClass(categoria) {
    const c = String(categoria).toLowerCase();
    if (c.includes('leilao') || c.includes('leilão') || c.includes('pátio') || c.includes('patio') || c.includes('taxa')) return 'cat-leilao';
    if (c.includes('guincho')) return 'cat-guincho';
    if (c.includes('mecanica') || c.includes('mecânica')) return 'cat-mecanica';
    if (c.includes('funilaria') || c.includes('pintura')) return 'cat-funilaria';
    if (c.includes('document') || c.includes('detran') || c.includes('ipva')) return 'cat-documentacao';
    if (c.includes('estet') || c.includes('higieniz')) return 'cat-estetica';
    return 'cat-outros';
}

function vincularEventosExclusaoGasto(veiculoId) {
    const botoesExcluir = document.querySelectorAll('.btn-delete-expense-row');
    botoesExcluir.forEach(btn => {
        btn.addEventListener('click', async () => {
            const gastoId = btn.getAttribute('data-gasto-id');
            if (!gastoId) return;

            if (!confirm('Deseja realmente remover este lançamento de gasto?')) return;

            try {
                if (state.modoApi) {
                    const res = await fetch(`${API_BASE}/veiculos/${veiculoId}/gastos/${gastoId}`, {
                        method: 'DELETE'
                    });
                    if (!res.ok) throw new Error('Erro ao excluir gasto');
                } else {
                    const veiculo = state.veiculos.find(v => String(v.id) === String(veiculoId));
                    if (veiculo && veiculo.gastos) {
                        veiculo.gastos = veiculo.gastos.filter(g => String(g.id) !== String(gastoId));
                        salvarLocal();
                    }
                }

                await carregarVeiculos();
                abrirModalDetalhes(veiculoId);
            } catch (err) {
                console.error('Erro ao excluir gasto:', err);
                alert('Erro ao excluir gasto do veículo.');
            }
        });
    });
}

async function adicionarNovoGasto(veiculoId) {
    const dataVal = document.getElementById('gastoInputData').value;
    const categoria = document.getElementById('gastoInputCategoria').value;
    const descricao = document.getElementById('gastoInputDescricao').value.trim();
    const oficina = document.getElementById('gastoInputOficina').value.trim();
    const valor = parseFloat(document.getElementById('gastoInputValor').value) || 0;

    if (!descricao || valor <= 0) {
        alert('Por favor, informe a descrição e o valor do gasto.');
        return;
    }

    const payload = {
        data: dataVal ? new Date(dataVal) : new Date(),
        categoria,
        descricao,
        oficina: oficina || null,
        valor
    };

    try {
        if (state.modoApi) {
            const res = await fetch(`${API_BASE}/veiculos/${veiculoId}/gastos`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) throw new Error('Falha ao adicionar gasto');
        } else {
            const veiculo = state.veiculos.find(v => String(v.id) === String(veiculoId));
            if (veiculo) {
                if (!veiculo.gastos) veiculo.gastos = [];
                const novoId = veiculo.gastos.length > 0 ? Math.max(...veiculo.gastos.map(g => Number(g.id) || 0)) + 1 : 1;
                veiculo.gastos.push({ id: novoId, ...payload, createdAt: new Date() });
                veiculo.custoTotal = (veiculo.custoTotal || 0) + valor;
                veiculo.totalPreparacao = (veiculo.totalPreparacao || 0) + valor;
                salvarLocal();
            }
        }

        await carregarVeiculos();
        abrirModalDetalhes(veiculoId);

    } catch (err) {
        console.error('Erro ao cadastrar gasto:', err);
        alert('Erro ao salvar novo gasto.');
    }
}

function abrirModalVenda(veiculo) {
    document.getElementById('vendaVehicleId').value = veiculo.id;
    document.getElementById('vendaModalSubtitle').textContent = `${veiculo.marca} ${veiculo.modelo} (${veiculo.placa || 'Sem placa'})`;
    document.getElementById('vendaPrecoAnuncio').value = veiculo.precoAnuncio || '';
    document.getElementById('vendaValorFinal').value = veiculo.valorVenda || veiculo.precoAnuncio || '';
    
    const hojeStr = new Date().toISOString().split('T')[0];
    document.getElementById('vendaData').value = veiculo.dataVenda ? new Date(veiculo.dataVenda).toISOString().split('T')[0] : hojeStr;
    document.getElementById('vendaStatus').value = veiculo.status === 'Vendido' ? 'Vendido' : 'Vendido';

    document.getElementById('vendaModalOverlay').classList.add('active');
}

function fecharModalVenda() {
    document.getElementById('vendaModalOverlay').classList.remove('active');
}

async function salvarVendaRapida(e) {
    e.preventDefault();

    const veiculoId = document.getElementById('vendaVehicleId').value;
    const precoAnuncio = document.getElementById('vendaPrecoAnuncio').value;
    const valorVenda = document.getElementById('vendaValorFinal').value;
    const dataVenda = document.getElementById('vendaData').value;
    const status = document.getElementById('vendaStatus').value;

    const payload = {
        precoAnuncio: precoAnuncio ? parseFloat(precoAnuncio) : null,
        valorVenda: valorVenda ? parseFloat(valorVenda) : null,
        dataVenda: dataVenda ? new Date(dataVenda) : new Date(),
        status
    };

    try {
        if (state.modoApi) {
            const res = await fetch(`${API_BASE}/veiculos/${veiculoId}/vender`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) throw new Error('Falha ao registrar venda');
        } else {
            const veiculo = state.veiculos.find(v => String(v.id) === String(veiculoId));
            if (veiculo) {
                veiculo.precoAnuncio = payload.precoAnuncio;
                veiculo.valorVenda = payload.valorVenda;
                veiculo.dataVenda = payload.dataVenda;
                veiculo.status = payload.status;
                if (payload.valorVenda) {
                    veiculo.lucroBruto = payload.valorVenda - veiculo.custoTotal;
                    veiculo.roiPct = veiculo.custoTotal > 0 ? (veiculo.lucroBruto / veiculo.custoTotal) * 100 : 0;
                }
                salvarLocal();
            }
        }

        fecharModalVenda();
        await carregarVeiculos();
        abrirModalDetalhes(veiculoId);

    } catch (err) {
        console.error('Erro na venda rápida:', err);
        alert('Erro ao registrar venda do veículo.');
    }
}

function exportarPlanilhaCsv(veiculo) {
    const headers = ['ID', 'Data', 'Categoria', 'Descricao', 'Oficina_Fornecedor', 'Valor_RS'];
    const rows = (veiculo.gastos || []).map(g => [
        g.id,
        formatarData(g.data),
        `"${g.categoria}"`,
        `"${g.descricao.replace(/"/g, '""')}"`,
        `"${(g.oficina || '').replace(/"/g, '""')}"`,
        (g.valor || 0).toFixed(2).replace('.', ',')
    ]);

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `gastos_${veiculo.marca}_${veiculo.modelo}_${veiculo.placa || veiculo.id}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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

