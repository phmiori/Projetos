/**
 * JS/Garagem/garagem.js
 * Lógica do Módulo Garagem (Hub Pessoal): ficha completa dos veículos,
 * histórico de manutenções e histórico de veículos vendidos.
 */

const API_BASE = '/api';

const stateGaragem = {
    veiculos: [],
    buscaAtivos: '',
    editVeiculoId: null,
    fichaVeiculoId: null,
    editManutencaoId: null
};

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initMobileNavigation();
    initSubNav();
    initBuscaAtivos();
    initModalVeiculo();
    initModalFicha();
    initModalManutencao();
    carregarVeiculos();
});

// =========================================================
// SUB-NAVEGAÇÃO EM ABAS
// =========================================================

function initSubNav() {
    document.querySelectorAll('.sub-nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.sub-nav-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            document.querySelectorAll('.garagem-subview').forEach(v => v.classList.remove('active'));
            const alvo = document.getElementById(btn.getAttribute('data-subtarget'));
            if (alvo) alvo.classList.add('active');
        });
    });
}

// =========================================================
// CARREGAMENTO E CÁLCULOS
// =========================================================

async function carregarVeiculos() {
    try {
        const resp = await fetch(`${API_BASE}/garagem/veiculos`);
        if (!resp.ok) throw new Error('Erro ao buscar veículos');
        stateGaragem.veiculos = await resp.json();
        renderAtivos();
        renderHistorico();
    } catch (err) {
        console.warn('[Garagem] Erro ao carregar veículos.', err.message);
    }
}

function buscarVeiculo(id) {
    return stateGaragem.veiculos.find(v => v.id === id);
}

function calcularGastoManutencao(veiculo) {
    return (veiculo.manutencoes || []).reduce((s, m) => s + (m.valor || 0), 0);
}

function calcularCustoTotal(veiculo) {
    return (veiculo.valorCompra || 0) + calcularGastoManutencao(veiculo);
}

function calcularResultado(veiculo) {
    if (veiculo.valorVenda === null || veiculo.valorVenda === undefined) return null;
    return veiculo.valorVenda - calcularCustoTotal(veiculo);
}

// =========================================================
// ABA 1: MINHA GARAGEM (VEÍCULOS ATIVOS)
// =========================================================

function initBuscaAtivos() {
    document.getElementById('inputGaragemBusca').addEventListener('input', (e) => {
        stateGaragem.buscaAtivos = e.target.value.trim().toLowerCase();
        renderAtivos();
    });
}

function renderAtivos() {
    const grid = document.getElementById('garagemAtivosGrid');
    grid.innerHTML = '';

    let ativos = stateGaragem.veiculos.filter(v => v.status === 'Ativo');

    if (stateGaragem.buscaAtivos) {
        const termo = stateGaragem.buscaAtivos;
        ativos = ativos.filter(v =>
            v.marca.toLowerCase().includes(termo) ||
            v.modelo.toLowerCase().includes(termo) ||
            (v.placa || '').toLowerCase().includes(termo)
        );
    }

    if (!ativos.length) {
        grid.innerHTML = stateGaragem.buscaAtivos
            ? '<div class="garagem-empty">Nenhum veículo encontrado para essa busca.</div>'
            : `<div class="garagem-empty empty-state">
                <span class="empty-state-icon">🚗</span>
                <p class="empty-state-title">Nenhum veículo na garagem</p>
                <p class="empty-state-text">Cadastre seu primeiro veículo para acompanhar quilometragem, manutenções e custos.</p>
                <button type="button" class="btn-missao-primary" onclick="abrirModalVeiculo(null)">+ Adicionar Veículo</button>
               </div>`;
    } else {
        ativos.forEach(v => grid.appendChild(criarCardVeiculo(v)));
    }

    atualizarKpisAtivos(ativos);
}

function atualizarKpisAtivos(ativos) {
    document.getElementById('kpiGaragemAtivos').textContent = ativos.length;
    const totalCompras = ativos.reduce((s, v) => s + (v.valorCompra || 0), 0);
    const totalManutencao = ativos.reduce((s, v) => s + calcularGastoManutencao(v), 0);
    document.getElementById('kpiGaragemValorCompras').textContent = formatarMoeda(totalCompras);
    document.getElementById('kpiGaragemManutencao').textContent = formatarMoeda(totalManutencao);
}

function criarCardVeiculo(v) {
    const card = document.createElement('div');
    card.className = 'garagem-veiculo-card';

    const gastoManutencao = calcularGastoManutencao(v);

    card.innerHTML = `
        <div class="garagem-card-header">
            <div>
                <div class="garagem-card-titulo">${escapeHtml(v.marca)} ${escapeHtml(v.modelo)}${v.ano ? ` (${v.ano})` : ''}</div>
                ${v.placa ? `<div class="garagem-card-placa">${escapeHtml(v.placa)}</div>` : ''}
            </div>
            <span class="garagem-pill pill-accent">${escapeHtml(v.status)}</span>
        </div>
        <div class="garagem-card-stats">
            <div>
                <span class="garagem-card-stat-label">Valor de Compra</span>
                <span class="garagem-card-stat-val">${formatarMoeda(v.valorCompra)}</span>
            </div>
            <div>
                <span class="garagem-card-stat-label">Data de Compra</span>
                <span class="garagem-card-stat-val">${formatarDataBR(v.dataCompra)}</span>
            </div>
            <div>
                <span class="garagem-card-stat-label">Manutenção</span>
                <span class="garagem-card-stat-val text-accent">${formatarMoeda(gastoManutencao)}</span>
            </div>
            <div>
                <span class="garagem-card-stat-label">KM Atual</span>
                <span class="garagem-card-stat-val">${(v.quilometragem !== null && v.quilometragem !== undefined) ? `${v.quilometragem} km` : '—'}</span>
            </div>
        </div>
        <div class="garagem-card-actions">
            <button type="button" class="btn-garagem-action" data-ver-ficha>Ver Ficha</button>
            <button type="button" class="btn-garagem-action" data-editar-veiculo>Editar</button>
        </div>
    `;

    card.querySelector('[data-ver-ficha]').addEventListener('click', () => abrirFicha(v.id));
    card.querySelector('[data-editar-veiculo]').addEventListener('click', () => abrirModalVeiculo(v));

    return card;
}

// =========================================================
// ABA 2: HISTÓRICO DE VENDIDOS
// =========================================================

function renderHistorico() {
    const tbody = document.getElementById('historicoTableBody');
    tbody.innerHTML = '';

    const vendidos = stateGaragem.veiculos.filter(v => v.status === 'Vendido');

    if (!vendidos.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="garagem-table-empty">Nenhum veículo vendido no histórico ainda.</td></tr>';
    } else {
        vendidos.forEach(v => {
            const gastoManutencao = calcularGastoManutencao(v);
            const resultado = calcularResultado(v);
            const tr = document.createElement('tr');

            tr.innerHTML = `
                <td>${escapeHtml(v.marca)} ${escapeHtml(v.modelo)}${v.ano ? ` (${v.ano})` : ''}</td>
                <td>${formatarDataBR(v.dataCompra)}</td>
                <td>${formatarMoeda(v.valorCompra)}</td>
                <td>${v.dataVenda ? formatarDataBR(v.dataVenda) : '—'}</td>
                <td>${(v.valorVenda !== null && v.valorVenda !== undefined) ? formatarMoeda(v.valorVenda) : '—'}</td>
                <td>${formatarMoeda(gastoManutencao)}</td>
                <td>${resultado !== null ? `<span class="garagem-pill ${resultado >= 0 ? 'pill-income' : 'pill-expense'}">${formatarMoeda(resultado)}</span>` : '—'}</td>
                <td>
                    <div class="garagem-table-actions">
                        <button type="button" class="btn-garagem-action" data-ver-ficha-hist="${v.id}">Ver Ficha</button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });

        tbody.querySelectorAll('[data-ver-ficha-hist]').forEach(btn => {
            btn.addEventListener('click', () => abrirFicha(Number(btn.dataset.verFichaHist)));
        });
    }

    atualizarKpisHistorico(vendidos);
}

function atualizarKpisHistorico(vendidos) {
    document.getElementById('kpiGaragemVendidos').textContent = vendidos.length;

    const resultadoTotal = vendidos.reduce((s, v) => s + (calcularResultado(v) || 0), 0);
    const el = document.getElementById('kpiGaragemResultado');
    el.textContent = formatarMoeda(resultadoTotal);
    el.className = resultadoTotal >= 0 ? 'kpi-value text-income' : 'kpi-value text-expense';
}

// =========================================================
// MODAL: NOVO / EDITAR VEÍCULO
// =========================================================

function initModalVeiculo() {
    document.getElementById('btnNovoVeiculoGaragem').addEventListener('click', () => abrirModalVeiculo(null));
    document.getElementById('modalVeiculoClose').addEventListener('click', fecharModalVeiculo);
    document.getElementById('btnVeiculoCancelar').addEventListener('click', fecharModalVeiculo);
    document.getElementById('modalVeiculoOverlay').addEventListener('click', (e) => {
        if (e.target.id === 'modalVeiculoOverlay') fecharModalVeiculo();
    });
    document.getElementById('veiculoForm').addEventListener('submit', salvarVeiculo);
    document.getElementById('btnVeiculoExcluir').addEventListener('click', excluirVeiculo);
    document.getElementById('inputVeiculoStatus').addEventListener('change', atualizarCamposVenda);
}

function atualizarCamposVenda() {
    const vendido = document.getElementById('inputVeiculoStatus').value === 'Vendido';
    document.getElementById('campoVeiculoDataVenda').style.display = vendido ? 'flex' : 'none';
    document.getElementById('campoVeiculoValorVenda').style.display = vendido ? 'flex' : 'none';
}

function abrirModalVeiculo(veiculo) {
    stateGaragem.editVeiculoId = veiculo ? veiculo.id : null;
    document.getElementById('modalVeiculoTitle').textContent = veiculo ? 'Editar Veículo' : 'Novo Veículo';
    document.getElementById('btnVeiculoExcluir').style.display = veiculo ? 'inline-flex' : 'none';
    document.getElementById('formVeiculoId').value = veiculo ? veiculo.id : '';
    document.getElementById('inputVeiculoMarca').value = veiculo ? veiculo.marca : '';
    document.getElementById('inputVeiculoModelo').value = veiculo ? veiculo.modelo : '';
    document.getElementById('inputVeiculoAno').value = veiculo ? veiculo.ano : '';
    document.getElementById('inputVeiculoPlaca').value = veiculo ? (veiculo.placa || '') : '';
    document.getElementById('inputVeiculoCor').value = veiculo ? (veiculo.cor || '') : '';
    document.getElementById('inputVeiculoKm').value = (veiculo && veiculo.quilometragem !== null && veiculo.quilometragem !== undefined) ? veiculo.quilometragem : '';
    document.getElementById('inputVeiculoDataCompra').value = veiculo ? isoParaInputDate(veiculo.dataCompra) : hojeInputDate();
    document.getElementById('inputVeiculoValorCompra').value = veiculo ? veiculo.valorCompra : '';
    document.getElementById('inputVeiculoStatus').value = veiculo ? veiculo.status : 'Ativo';
    document.getElementById('inputVeiculoDataVenda').value = (veiculo && veiculo.dataVenda) ? isoParaInputDate(veiculo.dataVenda) : '';
    document.getElementById('inputVeiculoValorVenda').value = (veiculo && veiculo.valorVenda !== null && veiculo.valorVenda !== undefined) ? veiculo.valorVenda : '';
    document.getElementById('inputVeiculoObs').value = veiculo ? (veiculo.observacoes || '') : '';
    atualizarCamposVenda();
    document.getElementById('modalVeiculoOverlay').classList.add('active');
}

function fecharModalVeiculo() {
    document.getElementById('modalVeiculoOverlay').classList.remove('active');
}

async function salvarVeiculo(e) {
    e.preventDefault();
    const payload = {
        marca: document.getElementById('inputVeiculoMarca').value.trim(),
        modelo: document.getElementById('inputVeiculoModelo').value.trim(),
        ano: document.getElementById('inputVeiculoAno').value,
        placa: document.getElementById('inputVeiculoPlaca').value.trim(),
        cor: document.getElementById('inputVeiculoCor').value.trim(),
        quilometragem: document.getElementById('inputVeiculoKm').value,
        dataCompra: document.getElementById('inputVeiculoDataCompra').value,
        valorCompra: document.getElementById('inputVeiculoValorCompra').value,
        status: document.getElementById('inputVeiculoStatus').value,
        dataVenda: document.getElementById('inputVeiculoDataVenda').value || null,
        valorVenda: document.getElementById('inputVeiculoValorVenda').value,
        observacoes: document.getElementById('inputVeiculoObs').value.trim()
    };

    try {
        const id = stateGaragem.editVeiculoId;
        const resp = await fetch(id ? `${API_BASE}/garagem/veiculos/${id}` : `${API_BASE}/garagem/veiculos`, {
            method: id ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!resp.ok) throw new Error('Falha ao salvar veículo');

        fecharModalVeiculo();
        await carregarVeiculos();
    } catch (err) {
        alert(`Não foi possível salvar o veículo. ${err.message}`);
    }
}

async function excluirVeiculo() {
    if (!stateGaragem.editVeiculoId) return;
    if (!confirm('Excluir este veículo e todo o seu histórico de manutenções?')) return;

    try {
        const resp = await fetch(`${API_BASE}/garagem/veiculos/${stateGaragem.editVeiculoId}`, { method: 'DELETE' });
        if (!resp.ok) throw new Error('Falha ao excluir veículo');

        fecharModalVeiculo();
        await carregarVeiculos();
    } catch (err) {
        alert(`Não foi possível excluir o veículo. ${err.message}`);
    }
}

// =========================================================
// MODAL: FICHA COMPLETA DO VEÍCULO
// =========================================================

function initModalFicha() {
    document.getElementById('modalFichaClose').addEventListener('click', fecharFicha);
    document.getElementById('btnFichaFechar').addEventListener('click', fecharFicha);
    document.getElementById('modalFichaOverlay').addEventListener('click', (e) => {
        if (e.target.id === 'modalFichaOverlay') fecharFicha();
    });
    document.getElementById('btnNovaManutencao').addEventListener('click', () => {
        abrirModalManutencao(null, stateGaragem.fichaVeiculoId);
    });
}

function abrirFicha(veiculoId) {
    stateGaragem.fichaVeiculoId = veiculoId;
    renderFicha();
    document.getElementById('modalFichaOverlay').classList.add('active');
}

function fecharFicha() {
    document.getElementById('modalFichaOverlay').classList.remove('active');
    stateGaragem.fichaVeiculoId = null;
}

function renderFicha() {
    const veiculo = buscarVeiculo(stateGaragem.fichaVeiculoId);
    if (!veiculo) {
        fecharFicha();
        return;
    }

    document.getElementById('fichaTitulo').textContent = `${veiculo.marca} ${veiculo.modelo}${veiculo.ano ? ` (${veiculo.ano})` : ''}`;
    document.getElementById('fichaSubtitulo').textContent = veiculo.placa ? `Placa ${veiculo.placa}` : 'Sem placa cadastrada';

    const gastoManutencao = calcularGastoManutencao(veiculo);
    const custoTotal = calcularCustoTotal(veiculo);
    const resultado = calcularResultado(veiculo);

    const infoGrid = document.getElementById('fichaInfoGrid');
    infoGrid.innerHTML = '';

    const itens = [
        ['Status', veiculo.status],
        ['Cor', veiculo.cor || '—'],
        ['Quilometragem', (veiculo.quilometragem !== null && veiculo.quilometragem !== undefined) ? `${veiculo.quilometragem} km` : '—'],
        ['Data de Compra', formatarDataBR(veiculo.dataCompra)],
        ['Valor de Compra', formatarMoeda(veiculo.valorCompra)],
        ['Total em Manutenção', formatarMoeda(gastoManutencao)],
        ['Custo Total', formatarMoeda(custoTotal)]
    ];

    if (veiculo.status === 'Vendido') {
        itens.push(['Data de Venda', veiculo.dataVenda ? formatarDataBR(veiculo.dataVenda) : '—']);
        itens.push(['Valor de Venda', (veiculo.valorVenda !== null && veiculo.valorVenda !== undefined) ? formatarMoeda(veiculo.valorVenda) : '—']);
        itens.push(['Resultado', resultado !== null ? formatarMoeda(resultado) : '—']);
    }

    itens.forEach(([label, val]) => {
        const item = document.createElement('div');
        item.className = 'garagem-ficha-item';
        item.innerHTML = `<span class="garagem-ficha-label">${label}</span><span class="garagem-ficha-val">${escapeHtml(String(val))}</span>`;
        infoGrid.appendChild(item);
    });

    if (veiculo.observacoes) {
        const obsItem = document.createElement('div');
        obsItem.className = 'garagem-ficha-item';
        obsItem.style.gridColumn = '1 / -1';
        obsItem.innerHTML = `<span class="garagem-ficha-label">Observações</span><span class="garagem-ficha-val">${escapeHtml(veiculo.observacoes)}</span>`;
        infoGrid.appendChild(obsItem);
    }

    renderManutencoesFicha(veiculo);
}

function renderManutencoesFicha(veiculo) {
    const tbody = document.getElementById('fichaManutencoesBody');
    tbody.innerHTML = '';

    const manutencoes = veiculo.manutencoes || [];

    if (!manutencoes.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="garagem-table-empty">Nenhuma manutenção registrada ainda.</td></tr>';
        return;
    }

    manutencoes.forEach(m => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${formatarDataBR(m.data)}</td>
            <td><span class="garagem-pill pill-accent">${escapeHtml(m.categoria)}</span></td>
            <td>${escapeHtml(m.descricao)}</td>
            <td class="text-expense">${formatarMoeda(m.valor)}</td>
            <td>${escapeHtml(m.oficina || '—')}</td>
            <td>${(m.quilometragem !== null && m.quilometragem !== undefined) ? `${m.quilometragem} km` : '—'}</td>
            <td>
                <div class="garagem-table-actions">
                    <button type="button" class="btn-garagem-action" data-editar-manutencao="${m.id}">Editar</button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll('[data-editar-manutencao]').forEach(btn => {
        btn.addEventListener('click', () => {
            const manutencao = manutencoes.find(m => m.id === Number(btn.dataset.editarManutencao));
            abrirModalManutencao(manutencao, veiculo.id);
        });
    });
}

// =========================================================
// MODAL: NOVA / EDITAR MANUTENÇÃO
// =========================================================

function initModalManutencao() {
    document.getElementById('modalManutencaoClose').addEventListener('click', fecharModalManutencao);
    document.getElementById('btnManutencaoCancelar').addEventListener('click', fecharModalManutencao);
    document.getElementById('modalManutencaoOverlay').addEventListener('click', (e) => {
        if (e.target.id === 'modalManutencaoOverlay') fecharModalManutencao();
    });
    document.getElementById('manutencaoForm').addEventListener('submit', salvarManutencao);
    document.getElementById('btnManutencaoExcluir').addEventListener('click', excluirManutencao);
}

function abrirModalManutencao(manutencao, veiculoId) {
    stateGaragem.editManutencaoId = manutencao ? manutencao.id : null;
    document.getElementById('modalManutencaoTitle').textContent = manutencao ? 'Editar Manutenção' : 'Nova Manutenção';
    document.getElementById('btnManutencaoExcluir').style.display = manutencao ? 'inline-flex' : 'none';
    document.getElementById('formManutencaoId').value = manutencao ? manutencao.id : '';
    document.getElementById('formManutencaoVeiculoId').value = veiculoId;
    document.getElementById('inputManutencaoData').value = manutencao ? isoParaInputDate(manutencao.data) : hojeInputDate();
    document.getElementById('inputManutencaoCategoria').value = manutencao ? manutencao.categoria : 'Troca de Óleo';
    document.getElementById('inputManutencaoDescricao').value = manutencao ? manutencao.descricao : '';
    document.getElementById('inputManutencaoValor').value = manutencao ? manutencao.valor : '';
    document.getElementById('inputManutencaoKm').value = (manutencao && manutencao.quilometragem !== null && manutencao.quilometragem !== undefined) ? manutencao.quilometragem : '';
    document.getElementById('inputManutencaoOficina').value = manutencao ? (manutencao.oficina || '') : '';
    document.getElementById('modalManutencaoOverlay').classList.add('active');
}

function fecharModalManutencao() {
    document.getElementById('modalManutencaoOverlay').classList.remove('active');
}

async function salvarManutencao(e) {
    e.preventDefault();
    const veiculoId = document.getElementById('formManutencaoVeiculoId').value;

    const payload = {
        data: document.getElementById('inputManutencaoData').value,
        categoria: document.getElementById('inputManutencaoCategoria').value,
        descricao: document.getElementById('inputManutencaoDescricao').value.trim(),
        valor: Number(document.getElementById('inputManutencaoValor').value),
        oficina: document.getElementById('inputManutencaoOficina').value.trim(),
        quilometragem: document.getElementById('inputManutencaoKm').value
    };

    try {
        const id = stateGaragem.editManutencaoId;
        const url = id ? `${API_BASE}/garagem/manutencoes/${id}` : `${API_BASE}/garagem/veiculos/${veiculoId}/manutencoes`;
        const resp = await fetch(url, {
            method: id ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!resp.ok) throw new Error('Falha ao salvar manutenção');

        fecharModalManutencao();
        await carregarVeiculos();
        if (stateGaragem.fichaVeiculoId) renderFicha();
    } catch (err) {
        alert(`Não foi possível salvar a manutenção. ${err.message}`);
    }
}

async function excluirManutencao() {
    if (!stateGaragem.editManutencaoId) return;
    if (!confirm('Deseja realmente excluir esta manutenção?')) return;

    try {
        const resp = await fetch(`${API_BASE}/garagem/manutencoes/${stateGaragem.editManutencaoId}`, { method: 'DELETE' });
        if (!resp.ok) throw new Error('Falha ao excluir manutenção');

        fecharModalManutencao();
        await carregarVeiculos();
        if (stateGaragem.fichaVeiculoId) renderFicha();
    } catch (err) {
        alert(`Não foi possível excluir a manutenção. ${err.message}`);
    }
}

// =========================================================
// UTILITÁRIOS
// =========================================================

function formatarMoeda(valor) {
    const num = Number(valor) || 0;
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Evita problemas de fuso horário: lê o AAAA-MM-DD direto da string ISO,
// sem passar por new Date() + getters locais.
function formatarDataBR(isoOuData) {
    const str = typeof isoOuData === 'string' ? isoOuData : new Date(isoOuData).toISOString();
    const [ano, mes, dia] = str.substring(0, 10).split('-');
    return `${dia}/${mes}/${ano}`;
}

function isoParaInputDate(isoOuData) {
    if (!isoOuData) return '';
    const str = typeof isoOuData === 'string' ? isoOuData : new Date(isoOuData).toISOString();
    return str.substring(0, 10);
}

function hojeInputDate() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function escapeHtml(texto) {
    const div = document.createElement('div');
    div.textContent = texto || '';
    return div.innerHTML;
}

// =========================================================
// TEMA E NAVEGAÇÃO MOBILE (compartilhado com os demais módulos)
// =========================================================

function initTheme() {
    const STORAGE_KEY = 'financehub_theme';
    const themeToggleBtn = document.getElementById('themeToggleBtn');
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
