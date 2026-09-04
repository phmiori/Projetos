/**
 * JS/FinancasCasa/financascasa.js
 * Lógica do Módulo Finanças & Casa (Hub Pessoal): Gastos da Casa, Despensa
 * e Tarefas & Manutenção, com sub-navegação em abas.
 */

const API_BASE = '/api';

const stateCasa = {
    gastos: [],
    despensa: [],
    tarefas: [],
    filtroCategoria: 'Todas',
    editGastoId: null,
    editDespensaId: null,
    editTarefaId: null
};

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initMobileNavigation();
    initSubNav();
    initFiltroCategorias();
    initModalGasto();
    initModalDespensa();
    initModalTarefa();
    carregarGastos();
    carregarDespensa();
    carregarTarefas();
});

// =========================================================
// SUB-NAVEGAÇÃO EM ABAS
// =========================================================

function initSubNav() {
    document.querySelectorAll('.sub-nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.sub-nav-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            document.querySelectorAll('.casa-subview').forEach(v => v.classList.remove('active'));
            const alvo = document.getElementById(btn.getAttribute('data-subtarget'));
            if (alvo) alvo.classList.add('active');
        });
    });
}

// =========================================================
// ABA 1: GASTOS DA CASA
// =========================================================

function initFiltroCategorias() {
    document.querySelectorAll('#casaFiltroCategorias .casa-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#casaFiltroCategorias .casa-filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            stateCasa.filtroCategoria = btn.dataset.categoria;
            renderGastos();
        });
    });
}

async function carregarGastos() {
    try {
        const resp = await fetch(`${API_BASE}/casa/gastos`);
        if (!resp.ok) throw new Error('Erro ao buscar gastos');
        stateCasa.gastos = await resp.json();
        renderGastos();
        atualizarKpisGastos();
    } catch (err) {
        console.warn('[Finanças & Casa] Erro ao carregar gastos.', err.message);
    }
}

function renderGastos() {
    const tbody = document.getElementById('gastosTableBody');
    tbody.innerHTML = '';

    const filtrados = stateCasa.filtroCategoria === 'Todas'
        ? stateCasa.gastos
        : stateCasa.gastos.filter(g => g.categoria === stateCasa.filtroCategoria);

    if (!filtrados.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="casa-table-empty">Nenhum gasto cadastrado.</td></tr>';
        return;
    }

    filtrados.forEach(g => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${formatarDataBR(g.data)}</td>
            <td><span class="casa-pill pill-accent">${escapeHtml(g.categoria)}</span></td>
            <td>${escapeHtml(g.descricao)}</td>
            <td class="text-expense">${formatarMoeda(g.valor)}</td>
            <td>${g.recorrente ? '<span class="casa-pill pill-muted">Sim</span>' : '—'}</td>
            <td>
                <div class="casa-table-actions">
                    <button type="button" class="btn-casa-action" data-editar-gasto="${g.id}">Editar</button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll('[data-editar-gasto]').forEach(btn => {
        btn.addEventListener('click', () => {
            const gasto = stateCasa.gastos.find(g => g.id === Number(btn.dataset.editarGasto));
            abrirModalGasto(gasto);
        });
    });
}

function atualizarKpisGastos() {
    const agora = new Date();
    const gastosMes = stateCasa.gastos.filter(g => {
        const d = new Date(g.data);
        return d.getUTCMonth() === agora.getMonth() && d.getUTCFullYear() === agora.getFullYear();
    });

    const totalMes = gastosMes.reduce((s, g) => s + (g.valor || 0), 0);
    const totalAcumulado = stateCasa.gastos.reduce((s, g) => s + (g.valor || 0), 0);

    document.getElementById('kpiCasaGastoMes').textContent = formatarMoeda(totalMes);
    document.getElementById('kpiCasaLancamentosMes').textContent = `${gastosMes.length} lançamento(s)`;
    document.getElementById('kpiCasaTotalAcumulado').textContent = formatarMoeda(totalAcumulado);

    const porCategoria = {};
    gastosMes.forEach(g => { porCategoria[g.categoria] = (porCategoria[g.categoria] || 0) + g.valor; });

    let maiorCategoria = '—';
    let maiorValor = 0;
    Object.entries(porCategoria).forEach(([cat, val]) => {
        if (val > maiorValor) { maiorValor = val; maiorCategoria = cat; }
    });

    document.getElementById('kpiCasaMaiorCategoria').textContent = maiorCategoria;
    document.getElementById('kpiCasaMaiorCategoriaValor').textContent = formatarMoeda(maiorValor);
}

function initModalGasto() {
    document.getElementById('btnNovoGasto').addEventListener('click', () => abrirModalGasto(null));
    document.getElementById('modalGastoClose').addEventListener('click', fecharModalGasto);
    document.getElementById('btnGastoCancelar').addEventListener('click', fecharModalGasto);
    document.getElementById('modalGastoOverlay').addEventListener('click', (e) => {
        if (e.target.id === 'modalGastoOverlay') fecharModalGasto();
    });
    document.getElementById('gastoForm').addEventListener('submit', salvarGasto);
    document.getElementById('btnGastoExcluir').addEventListener('click', excluirGasto);
}

function abrirModalGasto(gasto) {
    stateCasa.editGastoId = gasto ? gasto.id : null;
    document.getElementById('modalGastoTitle').textContent = gasto ? 'Editar Gasto' : 'Novo Gasto';
    document.getElementById('btnGastoExcluir').style.display = gasto ? 'inline-flex' : 'none';
    document.getElementById('formGastoId').value = gasto ? gasto.id : '';
    document.getElementById('inputGastoCategoria').value = gasto ? gasto.categoria : 'Manutenção';
    document.getElementById('inputGastoDescricao').value = gasto ? gasto.descricao : '';
    document.getElementById('inputGastoValor').value = gasto ? gasto.valor : '';
    document.getElementById('inputGastoData').value = gasto ? isoParaInputDate(gasto.data) : hojeInputDate();
    document.getElementById('inputGastoRecorrente').checked = gasto ? !!gasto.recorrente : false;
    document.getElementById('modalGastoOverlay').classList.add('active');
}

function fecharModalGasto() {
    document.getElementById('modalGastoOverlay').classList.remove('active');
}

async function salvarGasto(e) {
    e.preventDefault();
    const payload = {
        categoria: document.getElementById('inputGastoCategoria').value,
        descricao: document.getElementById('inputGastoDescricao').value.trim(),
        valor: Number(document.getElementById('inputGastoValor').value),
        data: document.getElementById('inputGastoData').value,
        recorrente: document.getElementById('inputGastoRecorrente').checked
    };

    try {
        const id = stateCasa.editGastoId;
        const resp = await fetch(id ? `${API_BASE}/casa/gastos/${id}` : `${API_BASE}/casa/gastos`, {
            method: id ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!resp.ok) throw new Error('Falha ao salvar gasto');

        fecharModalGasto();
        await carregarGastos();
    } catch (err) {
        alert(`Não foi possível salvar o gasto. ${err.message}`);
    }
}

async function excluirGasto() {
    if (!stateCasa.editGastoId) return;
    if (!confirm('Deseja realmente excluir este gasto?')) return;

    try {
        const resp = await fetch(`${API_BASE}/casa/gastos/${stateCasa.editGastoId}`, { method: 'DELETE' });
        if (!resp.ok) throw new Error('Falha ao excluir gasto');

        fecharModalGasto();
        await carregarGastos();
    } catch (err) {
        alert(`Não foi possível excluir o gasto. ${err.message}`);
    }
}

// =========================================================
// ABA 2: DESPENSA
// =========================================================

async function carregarDespensa() {
    try {
        const resp = await fetch(`${API_BASE}/casa/despensa`);
        if (!resp.ok) throw new Error('Erro ao buscar despensa');
        stateCasa.despensa = await resp.json();
        renderDespensa();
        atualizarKpisDespensa();
    } catch (err) {
        console.warn('[Finanças & Casa] Erro ao carregar despensa.', err.message);
    }
}

function renderDespensa() {
    const tbody = document.getElementById('despensaTableBody');
    tbody.innerHTML = '';

    if (!stateCasa.despensa.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="casa-table-empty">Nenhum item cadastrado na despensa.</td></tr>';
        return;
    }

    stateCasa.despensa.forEach(item => {
        const estoqueBaixo = item.quantidadeMinima > 0 && item.quantidade <= item.quantidadeMinima;
        const tr = document.createElement('tr');
        if (estoqueBaixo) tr.classList.add('casa-row-low-stock');

        tr.innerHTML = `
            <td>${escapeHtml(item.nome)}</td>
            <td><span class="casa-pill pill-accent">${escapeHtml(item.categoria)}</span></td>
            <td>${item.quantidade} ${escapeHtml(item.unidade)}</td>
            <td>${item.quantidadeMinima} ${escapeHtml(item.unidade)}</td>
            <td>${item.ultimaCompra ? formatarDataBR(item.ultimaCompra) : '—'}</td>
            <td>${estoqueBaixo ? '<span class="casa-pill pill-expense">Estoque Baixo</span>' : '<span class="casa-pill pill-income">OK</span>'}</td>
            <td>
                <div class="casa-table-actions">
                    <button type="button" class="btn-casa-action" data-editar-item="${item.id}">Editar</button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll('[data-editar-item]').forEach(btn => {
        btn.addEventListener('click', () => {
            const item = stateCasa.despensa.find(i => i.id === Number(btn.dataset.editarItem));
            abrirModalDespensa(item);
        });
    });
}

function atualizarKpisDespensa() {
    document.getElementById('kpiDespensaTotalItens').textContent = stateCasa.despensa.length;
    const baixos = stateCasa.despensa.filter(i => i.quantidadeMinima > 0 && i.quantidade <= i.quantidadeMinima).length;
    document.getElementById('kpiDespensaEstoqueBaixo').textContent = baixos;
}

function initModalDespensa() {
    document.getElementById('btnNovoItemDespensa').addEventListener('click', () => abrirModalDespensa(null));
    document.getElementById('modalDespensaClose').addEventListener('click', fecharModalDespensa);
    document.getElementById('btnDespensaCancelar').addEventListener('click', fecharModalDespensa);
    document.getElementById('modalDespensaOverlay').addEventListener('click', (e) => {
        if (e.target.id === 'modalDespensaOverlay') fecharModalDespensa();
    });
    document.getElementById('despensaForm').addEventListener('submit', salvarItemDespensa);
    document.getElementById('btnDespensaExcluir').addEventListener('click', excluirItemDespensa);
}

function abrirModalDespensa(item) {
    stateCasa.editDespensaId = item ? item.id : null;
    document.getElementById('modalDespensaTitle').textContent = item ? 'Editar Item' : 'Novo Item';
    document.getElementById('btnDespensaExcluir').style.display = item ? 'inline-flex' : 'none';
    document.getElementById('formDespensaId').value = item ? item.id : '';
    document.getElementById('inputDespensaNome').value = item ? item.nome : '';
    document.getElementById('inputDespensaCategoria').value = item ? item.categoria : 'Outros';
    document.getElementById('inputDespensaUnidade').value = item ? item.unidade : 'un';
    document.getElementById('inputDespensaQuantidade').value = item ? item.quantidade : '';
    document.getElementById('inputDespensaQtdMinima').value = item ? item.quantidadeMinima : '';
    document.getElementById('inputDespensaUltimaCompra').value = item && item.ultimaCompra ? isoParaInputDate(item.ultimaCompra) : '';
    document.getElementById('modalDespensaOverlay').classList.add('active');
}

function fecharModalDespensa() {
    document.getElementById('modalDespensaOverlay').classList.remove('active');
}

async function salvarItemDespensa(e) {
    e.preventDefault();
    const payload = {
        nome: document.getElementById('inputDespensaNome').value.trim(),
        categoria: document.getElementById('inputDespensaCategoria').value,
        unidade: document.getElementById('inputDespensaUnidade').value,
        quantidade: Number(document.getElementById('inputDespensaQuantidade').value) || 0,
        quantidadeMinima: Number(document.getElementById('inputDespensaQtdMinima').value) || 0,
        ultimaCompra: document.getElementById('inputDespensaUltimaCompra').value || null
    };

    try {
        const id = stateCasa.editDespensaId;
        const resp = await fetch(id ? `${API_BASE}/casa/despensa/${id}` : `${API_BASE}/casa/despensa`, {
            method: id ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!resp.ok) throw new Error('Falha ao salvar item');

        fecharModalDespensa();
        await carregarDespensa();
    } catch (err) {
        alert(`Não foi possível salvar o item. ${err.message}`);
    }
}

async function excluirItemDespensa() {
    if (!stateCasa.editDespensaId) return;
    if (!confirm('Deseja realmente excluir este item?')) return;

    try {
        const resp = await fetch(`${API_BASE}/casa/despensa/${stateCasa.editDespensaId}`, { method: 'DELETE' });
        if (!resp.ok) throw new Error('Falha ao excluir item');

        fecharModalDespensa();
        await carregarDespensa();
    } catch (err) {
        alert(`Não foi possível excluir o item. ${err.message}`);
    }
}

// =========================================================
// ABA 3: TAREFAS & MANUTENÇÃO
// =========================================================

async function carregarTarefas() {
    try {
        const resp = await fetch(`${API_BASE}/casa/tarefas`);
        if (!resp.ok) throw new Error('Erro ao buscar tarefas');
        stateCasa.tarefas = await resp.json();
        renderTarefas();
        atualizarKpisTarefas();
    } catch (err) {
        console.warn('[Finanças & Casa] Erro ao carregar tarefas.', err.message);
    }
}

function pillPrioridade(p) {
    if (p === 'Alta') return 'pill-expense';
    if (p === 'Baixa') return 'pill-income';
    return 'pill-accent';
}

function pillStatus(s) {
    if (s === 'Concluída') return 'pill-income';
    if (s === 'Em Andamento') return 'pill-muted';
    return 'pill-accent';
}

function renderTarefas() {
    const tbody = document.getElementById('tarefasTableBody');
    tbody.innerHTML = '';

    if (!stateCasa.tarefas.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="casa-table-empty">Nenhuma tarefa cadastrada.</td></tr>';
        return;
    }

    stateCasa.tarefas.forEach(t => {
        const tr = document.createElement('tr');
        const custoLabel = (t.custoReal !== null && t.custoReal !== undefined)
            ? formatarMoeda(t.custoReal)
            : (t.custoEstimado ? `~${formatarMoeda(t.custoEstimado)}` : '—');

        tr.innerHTML = `
            <td>${escapeHtml(t.titulo)}</td>
            <td><span class="casa-pill pill-accent">${escapeHtml(t.categoria)}</span></td>
            <td><span class="casa-pill ${pillPrioridade(t.prioridade)}">${escapeHtml(t.prioridade)}</span></td>
            <td><span class="casa-pill ${pillStatus(t.status)}">${escapeHtml(t.status)}</span></td>
            <td>${t.dataPrevista ? formatarDataBR(t.dataPrevista) : '—'}</td>
            <td>${custoLabel}</td>
            <td>
                <div class="casa-table-actions">
                    <button type="button" class="btn-casa-action" data-editar-tarefa="${t.id}">Editar</button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll('[data-editar-tarefa]').forEach(btn => {
        btn.addEventListener('click', () => {
            const tarefa = stateCasa.tarefas.find(t => t.id === Number(btn.dataset.editarTarefa));
            abrirModalTarefa(tarefa);
        });
    });
}

function atualizarKpisTarefas() {
    const pendentes = stateCasa.tarefas.filter(t => t.status === 'Pendente').length;
    const andamento = stateCasa.tarefas.filter(t => t.status === 'Em Andamento').length;

    const agora = new Date();
    const concluidasMes = stateCasa.tarefas.filter(t => {
        if (t.status !== 'Concluída' || !t.concluidaEm) return false;
        const d = new Date(t.concluidaEm);
        return d.getUTCMonth() === agora.getMonth() && d.getUTCFullYear() === agora.getFullYear();
    });

    const custoMes = concluidasMes.reduce((s, t) => s + (t.custoReal || 0), 0);

    document.getElementById('kpiTarefasPendentes').textContent = pendentes;
    document.getElementById('kpiTarefasAndamento').textContent = andamento;
    document.getElementById('kpiTarefasConcluidas').textContent = concluidasMes.length;
    document.getElementById('kpiTarefasCustoMes').textContent = `${formatarMoeda(custoMes)} em manutenção`;
}

function initModalTarefa() {
    document.getElementById('btnNovaTarefa').addEventListener('click', () => abrirModalTarefa(null));
    document.getElementById('modalTarefaClose').addEventListener('click', fecharModalTarefa);
    document.getElementById('btnTarefaCancelar').addEventListener('click', fecharModalTarefa);
    document.getElementById('modalTarefaOverlay').addEventListener('click', (e) => {
        if (e.target.id === 'modalTarefaOverlay') fecharModalTarefa();
    });
    document.getElementById('tarefaForm').addEventListener('submit', salvarTarefa);
    document.getElementById('btnTarefaExcluir').addEventListener('click', excluirTarefa);
}

function abrirModalTarefa(tarefa) {
    stateCasa.editTarefaId = tarefa ? tarefa.id : null;
    document.getElementById('modalTarefaTitle').textContent = tarefa ? 'Editar Tarefa' : 'Nova Tarefa';
    document.getElementById('btnTarefaExcluir').style.display = tarefa ? 'inline-flex' : 'none';
    document.getElementById('formTarefaId').value = tarefa ? tarefa.id : '';
    document.getElementById('inputTarefaTitulo').value = tarefa ? tarefa.titulo : '';
    document.getElementById('inputTarefaCategoria').value = tarefa ? tarefa.categoria : 'Manutenção';
    document.getElementById('inputTarefaPrioridade').value = tarefa ? tarefa.prioridade : 'Média';
    document.getElementById('inputTarefaStatus').value = tarefa ? tarefa.status : 'Pendente';
    document.getElementById('inputTarefaDataPrevista').value = tarefa && tarefa.dataPrevista ? isoParaInputDate(tarefa.dataPrevista) : '';
    document.getElementById('inputTarefaCustoEstimado').value = (tarefa && tarefa.custoEstimado !== null && tarefa.custoEstimado !== undefined) ? tarefa.custoEstimado : '';
    document.getElementById('inputTarefaCustoReal').value = (tarefa && tarefa.custoReal !== null && tarefa.custoReal !== undefined) ? tarefa.custoReal : '';
    document.getElementById('inputTarefaLancarGasto').checked = false;
    document.getElementById('inputTarefaDescricao').value = tarefa ? (tarefa.descricao || '') : '';
    document.getElementById('modalTarefaOverlay').classList.add('active');
}

function fecharModalTarefa() {
    document.getElementById('modalTarefaOverlay').classList.remove('active');
}

async function salvarTarefa(e) {
    e.preventDefault();

    const custoRealVal = document.getElementById('inputTarefaCustoReal').value;
    const custoEstimadoVal = document.getElementById('inputTarefaCustoEstimado').value;

    const payload = {
        titulo: document.getElementById('inputTarefaTitulo').value.trim(),
        descricao: document.getElementById('inputTarefaDescricao').value.trim(),
        categoria: document.getElementById('inputTarefaCategoria').value,
        prioridade: document.getElementById('inputTarefaPrioridade').value,
        status: document.getElementById('inputTarefaStatus').value,
        dataPrevista: document.getElementById('inputTarefaDataPrevista').value || null,
        custoEstimado: custoEstimadoVal === '' ? null : Number(custoEstimadoVal),
        custoReal: custoRealVal === '' ? null : Number(custoRealVal),
        lancarComoGasto: document.getElementById('inputTarefaLancarGasto').checked
    };

    try {
        const id = stateCasa.editTarefaId;
        const resp = await fetch(id ? `${API_BASE}/casa/tarefas/${id}` : `${API_BASE}/casa/tarefas`, {
            method: id ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!resp.ok) throw new Error('Falha ao salvar tarefa');

        fecharModalTarefa();
        await carregarTarefas();

        if (payload.status === 'Concluída' && payload.lancarComoGasto && payload.custoReal) {
            await carregarGastos();
        }
    } catch (err) {
        alert(`Não foi possível salvar a tarefa. ${err.message}`);
    }
}

async function excluirTarefa() {
    if (!stateCasa.editTarefaId) return;
    if (!confirm('Deseja realmente excluir esta tarefa?')) return;

    try {
        const resp = await fetch(`${API_BASE}/casa/tarefas/${stateCasa.editTarefaId}`, { method: 'DELETE' });
        if (!resp.ok) throw new Error('Falha ao excluir tarefa');

        fecharModalTarefa();
        await carregarTarefas();
    } catch (err) {
        alert(`Não foi possível excluir a tarefa. ${err.message}`);
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
