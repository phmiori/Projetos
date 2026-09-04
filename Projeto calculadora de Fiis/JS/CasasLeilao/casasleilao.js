/**
 * JS/CasasLeilao/casasleilao.js
 * Lógica do Módulo de Gestão de Casas de Leilão (FinanceHub)
 */

const state = {
    imoveis: [],
    filtroStatus: 'Todos',
    filtroBusca: '',
    imovelEmEdicao: null,
    tema: localStorage.getItem('financehub_theme') || 'dark',
    modoApi: true
};

const API_BASE = '/api';

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initMobileNavigation();
    initEventListeners();
    initCalculationTriggers();
    carregarImoveis();
});

function initTheme() {
    const root = document.documentElement;
    const themeToggleBtn = document.getElementById('themeToggleBtn');

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
        if (themeToggleBtn) {
            themeToggleBtn.setAttribute('aria-checked', theme === 'light' ? 'true' : 'false');
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
    const btnWelcome = document.getElementById('btnCadastrarNovoImovel');
    const btnEmpty = document.getElementById('btnEmptyCadastrar');

    if (btnWelcome) btnWelcome.addEventListener('click', () => abrirModalCadastro());
    if (btnEmpty) btnEmpty.addEventListener('click', () => abrirModalCadastro());

    const modalCloseBtn = document.getElementById('modalCloseBtn');
    const btnModalCancel = document.getElementById('btnModalCancel');
    const detailsCloseBtn = document.getElementById('detailsCloseBtn');
    const btnDetailsClose = document.getElementById('btnDetailsClose');
    const imovelModalOverlay = document.getElementById('imovelModalOverlay');
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

    if (imovelModalOverlay) {
        imovelModalOverlay.addEventListener('click', (e) => {
            if (e.target === imovelModalOverlay) fecharModalCadastro();
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

    const imovelForm = document.getElementById('imovelForm');
    if (imovelForm) {
        imovelForm.addEventListener('submit', salvarImovel);
    }

    const statusPills = document.querySelectorAll('.status-pill');
    statusPills.forEach(pill => {
        pill.addEventListener('click', () => {
            statusPills.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            state.filtroStatus = pill.getAttribute('data-status');
            renderizarImoveis();
        });
    });

    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            state.filtroBusca = e.target.value.toLowerCase().trim();
            renderizarImoveis();
        });
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
    const custasProcessuais = parseFloat(document.getElementById('inputCustasProcessuais').value) || 0;
    const custoDesocupacao = parseFloat(document.getElementById('inputCustoDesocupacao').value) || 0;

    const totalAquisicao = valorArremate + (valorArremate * (comissaoPct / 100)) + custasProcessuais + custoDesocupacao;

    const gastoReforma = parseFloat(document.getElementById('inputGastoReforma').value) || 0;
    const gastoAcabamento = parseFloat(document.getElementById('inputGastoAcabamento').value) || 0;
    const gastoLimpeza = parseFloat(document.getElementById('inputGastoLimpeza').value) || 0;
    const gastoDocumentacao = parseFloat(document.getElementById('inputGastoDocumentacao').value) || 0;

    const totalPreparacao = gastoReforma + gastoAcabamento + gastoLimpeza + gastoDocumentacao;
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

async function carregarImoveis() {
    try {
        const response = await fetch(`${API_BASE}/imoveis`);
        if (!response.ok) throw new Error('API indisponível');

        state.imoveis = await response.json();
        state.modoApi = true;
        document.getElementById('dbStatusText').textContent = 'Prisma Conectado';
    } catch (err) {
        console.warn('[Casas de Leilão] API offline, utilizando armazenamento local.', err.message);
        state.modoApi = false;
        document.getElementById('dbStatusText').textContent = 'Modo Local (Offline)';

        const localData = localStorage.getItem('casasleilao_imoveis');
        if (localData) {
            state.imoveis = JSON.parse(localData);
        } else {
            state.imoveis = [];
            salvarLocal();
        }
    }

    atualizarDashboard();
    renderizarImoveis();
}

function atualizarDashboard() {
    let lucroTotalAcumulado = 0;
    let capitalInvestidoParado = 0;
    let totalVendidos = 0;
    let totalEstoque = 0;
    let somaRoi = 0;

    state.imoveis.forEach(im => {
        if (im.status === 'Vendido') {
            totalVendidos++;
            if (im.lucroBruto !== null && im.lucroBruto !== undefined) {
                lucroTotalAcumulado += Number(im.lucroBruto);
            }
            if (im.roiPct !== null && im.roiPct !== undefined) {
                somaRoi += Number(im.roiPct);
            }
        } else {
            totalEstoque++;
            capitalInvestidoParado += Number(im.custoTotal || 0);
        }
    });

    const roiMedio = totalVendidos > 0 ? (somaRoi / totalVendidos) : 0;

    document.getElementById('kpiLucroTotal').textContent = formatarMoeda(lucroTotalAcumulado);
    document.getElementById('kpiQtdVendidos').textContent = `${totalVendidos} imóvel(is) vendido(s)`;

    document.getElementById('kpiCapitalParado').textContent = formatarMoeda(capitalInvestidoParado);
    document.getElementById('kpiQtdEstoque').textContent = `${totalEstoque} imóvel(is) ativo(s)`;

    document.getElementById('kpiRoiMedio').textContent = `${roiMedio.toFixed(1)}%`;

    const badgeCasasCount = document.getElementById('badgeCasasCount');
    if (badgeCasasCount) badgeCasasCount.textContent = state.imoveis.length;
}

function renderizarImoveis() {
    const grid = document.getElementById('vehiclesGrid');
    const emptyState = document.getElementById('emptyState');
    const sectionCounter = document.getElementById('sectionCounter');

    let filtrados = state.imoveis.filter(im => {
        let matchStatus = true;
        if (state.filtroStatus === 'Estoque') {
            matchStatus = im.status !== 'Vendido';
        } else if (state.filtroStatus !== 'Todos') {
            matchStatus = im.status === state.filtroStatus;
        }

        let matchBusca = true;
        if (state.filtroBusca) {
            const texto = `${im.endereco} ${im.cidade || ''} ${im.matricula || ''} ${im.origem || ''}`.toLowerCase();
            matchBusca = texto.includes(state.filtroBusca);
        }

        return matchStatus && matchBusca;
    });

    sectionCounter.textContent = `Exibindo ${filtrados.length} de ${state.imoveis.length} imóveis`;

    if (filtrados.length === 0) {
        grid.innerHTML = '';
        emptyState.style.display = 'flex';
        return;
    }

    emptyState.style.display = 'none';
    grid.innerHTML = filtrados.map(im => criarCardImovelHTML(im)).join('');

    document.querySelectorAll('.btn-view-details').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            abrirModalDetalhes(id);
        });
    });

    document.querySelectorAll('.btn-edit-imovel').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            abrirModalEdicao(id);
        });
    });

    document.querySelectorAll('.btn-delete-imovel').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            confirmarExclusao(id);
        });
    });
}

function getStatusBadgeClass(status) {
    return {
        'Em Desocupação': 'status-transito',
        'Em Regularização': 'status-regularizacao',
        'Em Reforma': 'status-preparacao',
        'Anunciado': 'status-anunciado',
        'Vendido': 'status-vendido'
    }[status] || 'status-transito';
}

function criarCardImovelHTML(im) {
    const statusClass = getStatusBadgeClass(im.status);

    const isVendido = im.status === 'Vendido';
    const lucro = im.lucroBruto !== null && im.lucroBruto !== undefined ? Number(im.lucroBruto) : null;
    const roi = im.roiPct !== null && im.roiPct !== undefined ? Number(im.roiPct) : null;

    return `
        <article class="car-card" id="imovelCard-${im.id}">
            <header class="car-card-header">
                <div class="car-title-block">
                    <h3 class="car-model-name">${escapeHTML(im.endereco)}</h3>
                    <div class="car-meta-tags">
                        <span class="car-tag">${escapeHTML(im.tipoImovel || 'Imóvel')}</span>
                        ${im.cidade ? `<span class="car-tag">${escapeHTML(im.cidade)}</span>` : ''}
                        <span class="car-tag">${escapeHTML(im.origem || 'Leilão')}</span>
                    </div>
                </div>
                <span class="status-badge ${statusClass}">${escapeHTML(im.status)}</span>
            </header>

            <div class="car-card-body">
                <div class="cost-row-summary">
                    <div class="cost-col">
                        <span class="cost-label">Aquisição (Leilão)</span>
                        <span class="cost-value">${formatarMoeda(im.totalAquisicao || 0)}</span>
                    </div>
                    <div class="cost-col">
                        <span class="cost-label">Reforma / Docs</span>
                        <span class="cost-value">${formatarMoeda(im.totalPreparacao || 0)}</span>
                    </div>
                </div>

                <div class="total-accumulated-box">
                    <span class="total-label">Custo Total Investido:</span>
                    <span class="total-value">${formatarMoeda(im.custoTotal || 0)}</span>
                </div>

                <div class="sale-result-box">
                    ${isVendido ? `
                        <div class="sale-metrics-grid">
                            <div class="sale-metric-item">
                                <span class="sale-metric-label">Valor de Venda:</span>
                                <span class="sale-metric-val">${formatarMoeda(im.valorVenda || 0)}</span>
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
                                <span class="sale-metric-val" style="font-size: 0.85rem;">${im.dataVenda ? formatarData(im.dataVenda) : 'Registrada'}</span>
                            </div>
                        </div>
                    ` : `
                        <div class="sale-metrics-grid">
                            <div class="sale-metric-item">
                                <span class="sale-metric-label">Preço de Anúncio:</span>
                                <span class="sale-metric-val text-accent">${im.precoAnuncio ? formatarMoeda(im.precoAnuncio) : 'Não anunciado'}</span>
                            </div>
                            <div class="sale-metric-item">
                                <span class="sale-metric-label">Lucro Estimado:</span>
                                <span class="sale-metric-val text-income">
                                    ${im.precoAnuncio && im.precoAnuncio > im.custoTotal ? formatarMoeda(im.precoAnuncio - im.custoTotal) : '--'}
                                </span>
                            </div>
                        </div>
                    `}
                </div>
            </div>

            <footer class="car-card-footer">
                <button class="btn-card-action btn-view-details" data-id="${im.id}" title="Ver Planilha de Gastos e Serviços">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect width="20" height="14" x="2" y="5" rx="2"></rect>
                        <line x1="2" y1="10" x2="22" y2="10"></line>
                    </svg>
                    <span>Gastos & Planilha</span>
                </button>

                <div style="display: flex; gap: 6px;">
                    <button class="btn-card-action btn-edit-imovel" data-id="${im.id}" title="Editar Dados do Imóvel">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M12 20h9"></path>
                            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                        </svg>
                        <span>Editar</span>
                    </button>

                    <button class="btn-card-action btn-card-delete btn-delete-imovel" data-id="${im.id}" title="Excluir Imóvel">
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
    state.imovelEmEdicao = null;
    document.getElementById('modalTitle').textContent = 'Cadastrar Novo Imóvel';
    document.getElementById('formImovelId').value = '';
    document.getElementById('imovelForm').reset();

    document.getElementById('inputTipoImovel').value = 'Casa';
    document.getElementById('inputComissaoPct').value = 5;
    document.getElementById('inputOrigem').value = 'Banco';
    document.getElementById('inputStatus').value = 'Em Desocupação';
    document.getElementById('inputCustasProcessuais').value = 0;
    document.getElementById('inputCustoDesocupacao').value = 0;
    document.getElementById('inputGastoReforma').value = 0;
    document.getElementById('inputGastoAcabamento').value = 0;
    document.getElementById('inputGastoLimpeza').value = 0;
    document.getElementById('inputGastoDocumentacao').value = 0;

    recalcularPrevisoesModal();
    document.getElementById('imovelModalOverlay').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function abrirModalEdicao(id) {
    const imovel = state.imoveis.find(im => String(im.id) === String(id));
    if (!imovel) return;

    state.imovelEmEdicao = imovel;
    document.getElementById('modalTitle').textContent = `Editar Dados: ${imovel.endereco}`;
    document.getElementById('formImovelId').value = imovel.id;

    document.getElementById('inputEndereco').value = imovel.endereco || '';
    document.getElementById('inputCidade').value = imovel.cidade || '';
    document.getElementById('inputTipoImovel').value = imovel.tipoImovel || 'Casa';
    document.getElementById('inputAreaM2').value = imovel.areaM2 || '';
    document.getElementById('inputQuartos').value = imovel.quartos || '';
    document.getElementById('inputBanheiros').value = imovel.banheiros || '';
    document.getElementById('inputMatricula').value = imovel.matricula || '';
    document.getElementById('inputLeiloeiro').value = imovel.leiloeiro || '';

    if (imovel.dataCompra) {
        const d = new Date(imovel.dataCompra);
        document.getElementById('inputDataCompra').value = d.toISOString().split('T')[0];
    } else {
        document.getElementById('inputDataCompra').value = '';
    }

    document.getElementById('inputOrigem').value = imovel.origem || 'Banco';
    document.getElementById('inputStatus').value = imovel.status || 'Em Desocupação';
    document.getElementById('inputObservacoes').value = imovel.observacoes || '';

    document.getElementById('inputValorArremate').value = imovel.valorArremate || 0;
    document.getElementById('inputComissaoPct').value = imovel.comissaoPct || 5;
    document.getElementById('inputCustasProcessuais').value = imovel.custasProcessuais || 0;
    document.getElementById('inputCustoDesocupacao').value = imovel.custoDesocupacao || 0;

    document.getElementById('inputGastoReforma').value = imovel.gastoReforma || 0;
    document.getElementById('inputGastoAcabamento').value = imovel.gastoAcabamento || 0;
    document.getElementById('inputGastoLimpeza').value = imovel.gastoLimpeza || 0;
    document.getElementById('inputGastoDocumentacao').value = imovel.gastoDocumentacao || 0;

    document.getElementById('inputPrecoAnuncio').value = imovel.precoAnuncio || '';
    document.getElementById('inputValorVenda').value = imovel.valorVenda || '';

    if (imovel.dataVenda) {
        const d = new Date(imovel.dataVenda);
        document.getElementById('inputDataVenda').value = d.toISOString().split('T')[0];
    } else {
        document.getElementById('inputDataVenda').value = '';
    }

    recalcularPrevisoesModal();
    document.getElementById('imovelModalOverlay').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function fecharModalCadastro() {
    document.getElementById('imovelModalOverlay').classList.remove('active');
    document.body.style.overflow = '';
}

async function salvarImovel(e) {
    e.preventDefault();

    const id = document.getElementById('formImovelId').value;
    const valorArremate = parseFloat(document.getElementById('inputValorArremate').value) || 0;
    const comissaoPct = parseFloat(document.getElementById('inputComissaoPct').value) || 0;
    const custasProcessuais = parseFloat(document.getElementById('inputCustasProcessuais').value) || 0;
    const custoDesocupacao = parseFloat(document.getElementById('inputCustoDesocupacao').value) || 0;
    const totalAquisicao = valorArremate + (valorArremate * (comissaoPct / 100)) + custasProcessuais + custoDesocupacao;

    const gastoReforma = parseFloat(document.getElementById('inputGastoReforma').value) || 0;
    const gastoAcabamento = parseFloat(document.getElementById('inputGastoAcabamento').value) || 0;
    const gastoLimpeza = parseFloat(document.getElementById('inputGastoLimpeza').value) || 0;
    const gastoDocumentacao = parseFloat(document.getElementById('inputGastoDocumentacao').value) || 0;
    const totalPreparacao = gastoReforma + gastoAcabamento + gastoLimpeza + gastoDocumentacao;

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

    const areaM2Val = document.getElementById('inputAreaM2').value;
    const quartosVal = document.getElementById('inputQuartos').value;
    const banheirosVal = document.getElementById('inputBanheiros').value;

    const payload = {
        endereco: document.getElementById('inputEndereco').value.trim(),
        cidade: document.getElementById('inputCidade').value.trim() || null,
        tipoImovel: document.getElementById('inputTipoImovel').value,
        areaM2: areaM2Val !== '' ? parseFloat(areaM2Val) : null,
        quartos: quartosVal !== '' ? parseInt(quartosVal, 10) : null,
        banheiros: banheirosVal !== '' ? parseInt(banheirosVal, 10) : null,
        matricula: document.getElementById('inputMatricula').value.trim() || null,
        leiloeiro: document.getElementById('inputLeiloeiro').value.trim() || null,
        dataCompra: dataCompraVal ? new Date(dataCompraVal) : null,
        origem: document.getElementById('inputOrigem').value,
        status: document.getElementById('inputStatus').value,
        observacoes: document.getElementById('inputObservacoes').value.trim() || null,
        valorArremate,
        comissaoPct,
        custasProcessuais,
        custoDesocupacao,
        totalAquisicao,
        gastoReforma,
        gastoAcabamento,
        gastoLimpeza,
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
            const url = id ? `${API_BASE}/imoveis/${id}` : `${API_BASE}/imoveis`;
            const method = id ? 'PUT' : 'POST';

            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error('Falha ao salvar no banco');
        } else {
            if (id) {
                const index = state.imoveis.findIndex(im => String(im.id) === String(id));
                if (index !== -1) {
                    state.imoveis[index] = { ...state.imoveis[index], ...payload, updatedAt: new Date() };
                }
            } else {
                const novoId = state.imoveis.length > 0 ? Math.max(...state.imoveis.map(im => Number(im.id) || 0)) + 1 : 1;
                state.imoveis.unshift({ id: novoId, ...payload, gastos: [], createdAt: new Date(), updatedAt: new Date() });
            }
            salvarLocal();
        }

        fecharModalCadastro();
        await carregarImoveis();

    } catch (err) {
        console.error('Erro ao salvar:', err);
        alert('Erro ao salvar imóvel. Verifique se o servidor backend está em execução.');
    }
}

async function confirmarExclusao(id) {
    const imovel = state.imoveis.find(im => String(im.id) === String(id));
    if (!imovel) return;

    const confirmou = confirm(`Tem certeza que deseja excluir o imóvel "${imovel.endereco}"?`);
    if (!confirmou) return;

    try {
        if (state.modoApi) {
            const response = await fetch(`${API_BASE}/imoveis/${id}`, { method: 'DELETE' });
            if (!response.ok) throw new Error('Erro ao excluir no banco');
        } else {
            state.imoveis = state.imoveis.filter(im => String(im.id) !== String(id));
            salvarLocal();
        }

        await carregarImoveis();
    } catch (err) {
        console.error('Erro na exclusão:', err);
        alert('Erro ao excluir imóvel do banco.');
    }
}

/**
 * Renderiza o Extrato Completo e Planilha de Gastos
 */
function abrirModalDetalhes(id) {
    const im = state.imoveis.find(item => String(item.id) === String(id));
    if (!im) return;

    document.getElementById('detailsTitle').textContent = im.endereco;
    document.getElementById('detailsSubtitle').textContent = `${im.tipoImovel || 'Imóvel'} | ${im.cidade || 'Sem cidade'} | Status: ${im.status}`;

    const gastos = im.gastos || [];
    let totalGastosPlanilha = 0;
    gastos.forEach(g => {
        totalGastosPlanilha += (Number(g.valor) || 0);
    });

    const isVendido = im.status === 'Vendido';
    const lucroExibido = isVendido
        ? (im.lucroBruto !== null ? im.lucroBruto : (im.valorVenda ? im.valorVenda - im.custoTotal : 0))
        : (im.precoAnuncio ? im.precoAnuncio - im.custoTotal : 0);

    const statusBadgeClass = isVendido ? 'status-vendido-tag' : (im.status === 'Anunciado' ? 'status-venda' : 'status-preparando');
    const statusTexto = isVendido ? 'VENDIDO' : (im.status === 'Anunciado' ? 'À VENDA' : im.status.toUpperCase());

    const hojeStr = new Date().toISOString().split('T')[0];

    const html = `
        <!-- 1. Header do Imóvel com Indicadores -->
        <div class="expense-vehicle-header">
            <div class="expense-header-top">
                <div class="expense-vehicle-title-wrap">
                    <h2 class="expense-vehicle-name">${escapeHTML(im.endereco)}</h2>
                    <span class="status-badge-inline ${statusBadgeClass}">${statusTexto}</span>
                </div>
            </div>
            <div class="expense-vehicle-meta">
                <span>Tipo: <strong>${escapeHTML(im.tipoImovel || 'Imóvel')}</strong></span>
                <span>Área: <strong>${im.areaM2 ? im.areaM2 + ' m²' : 'Não informada'}</strong></span>
                <span>Leiloeiro / Origem: <strong>${escapeHTML(im.leiloeiro || im.origem || 'Leilão')}</strong></span>
                <span>Compra: <strong>${im.dataCompra ? formatarData(im.dataCompra) : (im.createdAt ? formatarData(im.createdAt) : '--')}</strong></span>
            </div>

            <!-- 4 Cards de Métricas -->
            <div class="expense-kpis-grid">
                <div class="expense-kpi-box">
                    <span class="expense-kpi-label">Lance / Arrematação</span>
                    <span class="expense-kpi-val">${formatarMoeda(im.valorArremate || 0)}</span>
                </div>
                <div class="expense-kpi-box">
                    <span class="expense-kpi-label">Gastos na Planilha</span>
                    <span class="expense-kpi-val accent">${formatarMoeda(totalGastosPlanilha > 0 ? totalGastosPlanilha : im.totalPreparacao + (im.custasProcessuais || 0) + (im.custoDesocupacao || 0))}</span>
                </div>
                <div class="expense-kpi-box">
                    <span class="expense-kpi-label">Custo Total do Imóvel</span>
                    <span class="expense-kpi-val accent">${formatarMoeda(im.custoTotal || 0)}</span>
                </div>
                <div class="expense-kpi-box highlight">
                    <span class="expense-kpi-label">${isVendido ? 'Lucro Realizado (Venda)' : 'Lucro Estimado (Anúncio)'}</span>
                    <span class="expense-kpi-val ${lucroExibido >= 0 ? 'income' : 'expense'}">${formatarMoeda(lucroExibido)}</span>
                </div>
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

            <form id="formNovoGasto" data-imovel-id="${im.id}">
                <div class="expense-inputs-bar">
                    <input type="date" id="gastoInputData" class="input-missao" value="${hojeStr}" required title="Data do serviço ou taxa">

                    <select id="gastoInputCategoria" class="input-missao" required>
                        <option value="Taxa Leilão / Processual">Taxa Leilão / Processual</option>
                        <option value="Desocupação">Desocupação</option>
                        <option value="Reforma" selected>Reforma</option>
                        <option value="Acabamento / Pintura">Acabamento / Pintura</option>
                        <option value="Documentação / Cartório">Documentação / Cartório</option>
                        <option value="Limpeza">Limpeza</option>
                        <option value="Outros">Outros</option>
                    </select>

                    <input type="text" id="gastoInputDescricao" class="input-missao" placeholder="O que foi feito? (Ex: Troca do piso da sala)" required>

                    <input type="text" id="gastoInputFornecedor" class="input-missao" placeholder="Fornecedor / Loja (Ex: Construtora Silva)">

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

        <!-- 3. Planilha de Gastos e Serviços do Imóvel -->
        <div class="expense-table-container">
            <div class="expense-table-header">
                <h3 class="expense-table-title">Planilha de Gastos & Serviços do Imóvel</h3>
                <div class="expense-table-actions">
                    <button type="button" class="btn-export-csv" id="btnExportarCsv" data-id="${im.id}">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="7 10 12 15 17 10"></polyline>
                            <line x1="12" y1="15" x2="12" y2="3"></line>
                        </svg>
                        <span>Exportar Planilha (CSV)</span>
                    </button>

                    <button type="button" class="btn-mark-sold" id="btnMarcarVendido" data-id="${im.id}">
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
                            <th style="width: 180px;">CATEGORIA</th>
                            <th>DESCRIÇÃO DO QUE FOI FEITO</th>
                            <th style="width: 200px;">FORNECEDOR</th>
                            <th style="width: 140px; text-align: right;">VALOR (R$)</th>
                            <th style="width: 60px; text-align: center;">EXCLUIR</th>
                        </tr>
                    </thead>
                    <tbody id="expenseTableBody">
                        ${renderizarLinhasGastos(gastos, im)}
                    </tbody>
                </table>
            </div>

            <div class="expense-table-footer">
                <span class="expense-footer-label">TOTAL DE GASTOS NA PLANILHA:</span>
                <span class="expense-footer-total">${formatarMoeda(totalGastosPlanilha > 0 ? totalGastosPlanilha : im.totalPreparacao + (im.custasProcessuais || 0) + (im.custoDesocupacao || 0))}</span>
            </div>
        </div>
    `;

    document.getElementById('detailsBody').innerHTML = html;

    // Vincular Eventos do Extrato de Gastos
    const formNovoGasto = document.getElementById('formNovoGasto');
    if (formNovoGasto) {
        formNovoGasto.addEventListener('submit', async (e) => {
            e.preventDefault();
            await adicionarNovoGasto(im.id);
        });
    }

    const btnExportarCsv = document.getElementById('btnExportarCsv');
    if (btnExportarCsv) {
        btnExportarCsv.addEventListener('click', () => exportarPlanilhaCsv(im));
    }

    const btnMarcarVendido = document.getElementById('btnMarcarVendido');
    if (btnMarcarVendido) {
        btnMarcarVendido.addEventListener('click', () => abrirModalVenda(im));
    }

    const btnEdit = document.getElementById('btnDetailsEdit');
    if (btnEdit) {
        btnEdit.onclick = () => {
            fecharModalDetalhes();
            abrirModalEdicao(id);
        };
    }

    // Vincular eventos de exclusão de gastos
    vincularEventosExclusaoGasto(im.id);

    document.getElementById('detailsModalOverlay').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function renderizarLinhasGastos(gastos, im) {
    if (!gastos || gastos.length === 0) {
        // Se ainda não tiver registros detalhados na tabela, cria linhas base dos custos fixos informados
        const linhasIniciais = [];
        let index = 1;

        if (im.custasProcessuais > 0) {
            linhasIniciais.push(`
                <tr>
                    <td>${index++}</td>
                    <td>${im.dataCompra ? formatarData(im.dataCompra) : formatarData(im.createdAt)}</td>
                    <td><span class="cat-badge cat-leilao">TAXA PROCESSUAL</span></td>
                    <td>Custas processuais e taxas do leilão</td>
                    <td>${escapeHTML(im.leiloeiro || 'Leiloeiro')}</td>
                    <td style="text-align: right; font-weight: 700;">${formatarMoeda(im.custasProcessuais)}</td>
                    <td style="text-align: center;">--</td>
                </tr>
            `);
        }

        if (im.custoDesocupacao > 0) {
            linhasIniciais.push(`
                <tr>
                    <td>${index++}</td>
                    <td>${im.dataCompra ? formatarData(im.dataCompra) : formatarData(im.createdAt)}</td>
                    <td><span class="cat-badge cat-guincho">DESOCUPAÇÃO</span></td>
                    <td>Custos de reintegração de posse e desocupação</td>
                    <td>Despachante / Oficial de Justiça</td>
                    <td style="text-align: right; font-weight: 700;">${formatarMoeda(im.custoDesocupacao)}</td>
                    <td style="text-align: center;">--</td>
                </tr>
            `);
        }

        if (im.gastoReforma > 0) {
            linhasIniciais.push(`
                <tr>
                    <td>${index++}</td>
                    <td>${im.createdAt ? formatarData(im.createdAt) : '--'}</td>
                    <td><span class="cat-badge cat-mecanica">REFORMA</span></td>
                    <td>Obra e reforma geral do imóvel</td>
                    <td>Construtora / Pedreiro</td>
                    <td style="text-align: right; font-weight: 700;">${formatarMoeda(im.gastoReforma)}</td>
                    <td style="text-align: center;">--</td>
                </tr>
            `);
        }

        if (im.gastoAcabamento > 0) {
            linhasIniciais.push(`
                <tr>
                    <td>${index++}</td>
                    <td>${im.createdAt ? formatarData(im.createdAt) : '--'}</td>
                    <td><span class="cat-badge cat-funilaria">ACABAMENTO / PINTURA</span></td>
                    <td>Acabamentos, pintura e retoques finais</td>
                    <td>Pintor / Acabamento</td>
                    <td style="text-align: right; font-weight: 700;">${formatarMoeda(im.gastoAcabamento)}</td>
                    <td style="text-align: center;">--</td>
                </tr>
            `);
        }

        if (im.gastoDocumentacao > 0) {
            linhasIniciais.push(`
                <tr>
                    <td>${index++}</td>
                    <td>${im.createdAt ? formatarData(im.createdAt) : '--'}</td>
                    <td><span class="cat-badge cat-documentacao">DOCUMENTAÇÃO</span></td>
                    <td>Cartório, ITBI e registro do imóvel</td>
                    <td>Cartório / Despachante</td>
                    <td style="text-align: right; font-weight: 700;">${formatarMoeda(im.gastoDocumentacao)}</td>
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
                    Nenhum gasto lançado para este imóvel ainda. Use o formulário acima para lançar serviços!
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
                <td>${g.fornecedor ? escapeHTML(g.fornecedor) : '--'}</td>
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
    if (c.includes('leilao') || c.includes('leilão') || c.includes('processual') || c.includes('taxa')) return 'cat-leilao';
    if (c.includes('desocup')) return 'cat-guincho';
    if (c.includes('reforma')) return 'cat-mecanica';
    if (c.includes('acabamento') || c.includes('pintura')) return 'cat-funilaria';
    if (c.includes('document') || c.includes('cartório') || c.includes('cartorio') || c.includes('itbi')) return 'cat-documentacao';
    if (c.includes('limpeza')) return 'cat-estetica';
    return 'cat-outros';
}

function vincularEventosExclusaoGasto(imovelId) {
    const botoesExcluir = document.querySelectorAll('.btn-delete-expense-row');
    botoesExcluir.forEach(btn => {
        btn.addEventListener('click', async () => {
            const gastoId = btn.getAttribute('data-gasto-id');
            if (!gastoId) return;

            if (!confirm('Deseja realmente remover este lançamento de gasto?')) return;

            try {
                if (state.modoApi) {
                    const res = await fetch(`${API_BASE}/imoveis/${imovelId}/gastos/${gastoId}`, {
                        method: 'DELETE'
                    });
                    if (!res.ok) throw new Error('Erro ao excluir gasto');
                } else {
                    const imovel = state.imoveis.find(im => String(im.id) === String(imovelId));
                    if (imovel && imovel.gastos) {
                        imovel.gastos = imovel.gastos.filter(g => String(g.id) !== String(gastoId));
                        salvarLocal();
                    }
                }

                await carregarImoveis();
                abrirModalDetalhes(imovelId);
            } catch (err) {
                console.error('Erro ao excluir gasto:', err);
                alert('Erro ao excluir gasto do imóvel.');
            }
        });
    });
}

async function adicionarNovoGasto(imovelId) {
    const dataVal = document.getElementById('gastoInputData').value;
    const categoria = document.getElementById('gastoInputCategoria').value;
    const descricao = document.getElementById('gastoInputDescricao').value.trim();
    const fornecedor = document.getElementById('gastoInputFornecedor').value.trim();
    const valor = parseFloat(document.getElementById('gastoInputValor').value) || 0;

    if (!descricao || valor <= 0) {
        alert('Por favor, informe a descrição e o valor do gasto.');
        return;
    }

    const payload = {
        data: dataVal ? new Date(dataVal) : new Date(),
        categoria,
        descricao,
        fornecedor: fornecedor || null,
        valor
    };

    try {
        if (state.modoApi) {
            const res = await fetch(`${API_BASE}/imoveis/${imovelId}/gastos`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) throw new Error('Falha ao adicionar gasto');
        } else {
            const imovel = state.imoveis.find(im => String(im.id) === String(imovelId));
            if (imovel) {
                if (!imovel.gastos) imovel.gastos = [];
                const novoId = imovel.gastos.length > 0 ? Math.max(...imovel.gastos.map(g => Number(g.id) || 0)) + 1 : 1;
                imovel.gastos.push({ id: novoId, ...payload, createdAt: new Date() });
                imovel.custoTotal = (imovel.custoTotal || 0) + valor;
                imovel.totalPreparacao = (imovel.totalPreparacao || 0) + valor;
                salvarLocal();
            }
        }

        await carregarImoveis();
        abrirModalDetalhes(imovelId);

    } catch (err) {
        console.error('Erro ao cadastrar gasto:', err);
        alert('Erro ao salvar novo gasto.');
    }
}

function abrirModalVenda(imovel) {
    document.getElementById('vendaImovelId').value = imovel.id;
    document.getElementById('vendaModalSubtitle').textContent = `${imovel.endereco} (${imovel.tipoImovel || 'Imóvel'})`;
    document.getElementById('vendaPrecoAnuncio').value = imovel.precoAnuncio || '';
    document.getElementById('vendaValorFinal').value = imovel.valorVenda || imovel.precoAnuncio || '';

    const hojeStr = new Date().toISOString().split('T')[0];
    document.getElementById('vendaData').value = imovel.dataVenda ? new Date(imovel.dataVenda).toISOString().split('T')[0] : hojeStr;
    document.getElementById('vendaStatus').value = 'Vendido';

    document.getElementById('vendaModalOverlay').classList.add('active');
}

function fecharModalVenda() {
    document.getElementById('vendaModalOverlay').classList.remove('active');
}

async function salvarVendaRapida(e) {
    e.preventDefault();

    const imovelId = document.getElementById('vendaImovelId').value;
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
            const res = await fetch(`${API_BASE}/imoveis/${imovelId}/vender`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) throw new Error('Falha ao registrar venda');
        } else {
            const imovel = state.imoveis.find(im => String(im.id) === String(imovelId));
            if (imovel) {
                imovel.precoAnuncio = payload.precoAnuncio;
                imovel.valorVenda = payload.valorVenda;
                imovel.dataVenda = payload.dataVenda;
                imovel.status = payload.status;
                if (payload.valorVenda) {
                    imovel.lucroBruto = payload.valorVenda - imovel.custoTotal;
                    imovel.roiPct = imovel.custoTotal > 0 ? (imovel.lucroBruto / imovel.custoTotal) * 100 : 0;
                }
                salvarLocal();
            }
        }

        fecharModalVenda();
        await carregarImoveis();
        abrirModalDetalhes(imovelId);

    } catch (err) {
        console.error('Erro na venda rápida:', err);
        alert('Erro ao registrar venda do imóvel.');
    }
}

function exportarPlanilhaCsv(imovel) {
    const headers = ['ID', 'Data', 'Categoria', 'Descricao', 'Fornecedor', 'Valor_RS'];
    const rows = (imovel.gastos || []).map(g => [
        g.id,
        formatarData(g.data),
        `"${g.categoria}"`,
        `"${g.descricao.replace(/"/g, '""')}"`,
        `"${(g.fornecedor || '').replace(/"/g, '""')}"`,
        (g.valor || 0).toFixed(2).replace('.', ',')
    ]);

    const csvContent = '﻿' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `gastos_imovel_${imovel.id}.csv`);
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
    localStorage.setItem('casasleilao_imoveis', JSON.stringify(state.imoveis));
}
