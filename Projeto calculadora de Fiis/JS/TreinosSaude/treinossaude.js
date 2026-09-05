/**
 * JS/TreinosSaude/treinossaude.js
 * Lógica do Módulo Treinos & Saúde (Hub Pessoal): Blocos de Treino com
 * exercícios, e Registros de Saúde (peso/medidas, água, sono).
 */

const API_BASE = '/api';
const DIAS_SEMANA_ORDEM = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
const DIAS_SEMANA_LABEL = {
    Segunda: 'Segunda-feira',
    Terça: 'Terça-feira',
    Quarta: 'Quarta-feira',
    Quinta: 'Quinta-feira',
    Sexta: 'Sexta-feira',
    Sábado: 'Sábado',
    Domingo: 'Domingo'
};

const stateTS = {
    blocos: [],
    registrosSaude: [],
    editBlocoId: null,
    editExercicioId: null,
    exercicioBlocoAtivoId: null,
    editSaudeId: null
};

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initMobileNavigation();
    initSubNav();
    initModalBloco();
    initModalExercicio();
    initModalSaude();
    carregarBlocos();
    carregarSaude();
});

// =========================================================
// SUB-NAVEGAÇÃO EM ABAS
// =========================================================

function initSubNav() {
    document.querySelectorAll('.sub-nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.sub-nav-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            document.querySelectorAll('.ts-subview').forEach(v => v.classList.remove('active'));
            const alvo = document.getElementById(btn.getAttribute('data-subtarget'));
            if (alvo) alvo.classList.add('active');
        });
    });
}

// =========================================================
// ABA 1: TREINOS (BLOCOS + EXERCÍCIOS)
// =========================================================

async function carregarBlocos() {
    try {
        const resp = await fetch(`${API_BASE}/treinos/blocos`);
        if (!resp.ok) throw new Error('Erro ao buscar blocos');
        stateTS.blocos = await resp.json();
        renderBlocos();
        atualizarKpisTreino();
    } catch (err) {
        console.warn('[Treinos & Saúde] Erro ao carregar blocos.', err.message);
    }
}

function renderBlocos() {
    const container = document.getElementById('blocosContainer');
    container.innerHTML = '';

    if (!stateTS.blocos.length) {
        container.innerHTML = `
            <div class="ts-blocos-empty empty-state">
                <span class="empty-state-icon">💪</span>
                <p class="empty-state-title">Nenhum bloco de treino cadastrado</p>
                <p class="empty-state-text">Crie o primeiro bloco (ex.: "Treino A - Peito e Tríceps") para organizar seus exercícios por dia da semana.</p>
                <button type="button" class="btn-missao-primary" onclick="abrirModalBloco(null)">+ Novo Bloco</button>
            </div>`;
        return;
    }

    const grupos = {};
    stateTS.blocos.forEach(bloco => {
        const chave = bloco.diaSemana || 'Sem dia definido';
        if (!grupos[chave]) grupos[chave] = [];
        grupos[chave].push(bloco);
    });

    const chavesOrdenadas = [
        ...DIAS_SEMANA_ORDEM.filter(dia => grupos[dia]),
        ...(grupos['Sem dia definido'] ? ['Sem dia definido'] : [])
    ];

    chavesOrdenadas.forEach(chave => container.appendChild(criarGrupoDia(chave, grupos[chave])));
}

function criarGrupoDia(chave, blocosDoDia) {
    const semDia = chave === 'Sem dia definido';

    const grupoWrap = document.createElement('div');
    grupoWrap.className = 'ts-dia-grupo';

    const header = document.createElement('div');
    header.className = semDia ? 'ts-dia-header is-unassigned' : 'ts-dia-header';

    const titulo = document.createElement('h3');
    titulo.className = semDia ? 'ts-dia-titulo is-unassigned' : 'ts-dia-titulo';
    titulo.textContent = semDia ? chave : (DIAS_SEMANA_LABEL[chave] || chave);

    const btnAdd = document.createElement('button');
    btnAdd.type = 'button';
    btnAdd.className = 'btn-ts-icon';
    btnAdd.textContent = '+ Adicionar Bloco';
    btnAdd.addEventListener('click', () => abrirModalBloco(null, semDia ? '' : chave));

    header.appendChild(titulo);
    header.appendChild(btnAdd);
    grupoWrap.appendChild(header);

    const grid = document.createElement('div');
    grid.className = 'ts-blocos-grid';
    blocosDoDia.forEach(bloco => grid.appendChild(criarCardBloco(bloco)));
    grupoWrap.appendChild(grid);

    return grupoWrap;
}

function criarCardBloco(bloco) {
    const card = document.createElement('div');
    card.className = 'ts-bloco-card';

    const header = document.createElement('div');
    header.className = 'ts-bloco-header';

    const infoWrap = document.createElement('div');
    const nome = document.createElement('div');
    nome.className = 'ts-bloco-nome';
    nome.textContent = bloco.nome;
    infoWrap.appendChild(nome);

    if (bloco.observacoes) {
        const obs = document.createElement('div');
        obs.className = 'ts-bloco-obs';
        obs.textContent = bloco.observacoes;
        infoWrap.appendChild(obs);
    }

    const actions = document.createElement('div');
    actions.className = 'ts-bloco-actions';

    const btnEditar = document.createElement('button');
    btnEditar.type = 'button';
    btnEditar.className = 'btn-ts-icon';
    btnEditar.textContent = 'Editar';
    btnEditar.addEventListener('click', () => abrirModalBloco(bloco));

    actions.appendChild(btnEditar);
    header.appendChild(infoWrap);
    header.appendChild(actions);
    card.appendChild(header);

    const lista = document.createElement('div');
    lista.className = 'ts-exercicios-list';

    if (!bloco.exercicios.length) {
        const vazio = document.createElement('p');
        vazio.className = 'ts-empty-msg';
        vazio.textContent = 'Nenhum exercício adicionado ainda.';
        lista.appendChild(vazio);
    } else {
        bloco.exercicios.forEach(ex => lista.appendChild(criarLinhaExercicio(ex)));
    }

    card.appendChild(lista);

    const btnAddExercicio = document.createElement('button');
    btnAddExercicio.type = 'button';
    btnAddExercicio.className = 'btn-ts-icon';
    btnAddExercicio.textContent = '+ Adicionar Exercício';
    btnAddExercicio.addEventListener('click', () => abrirModalExercicio(null, bloco.id));
    card.appendChild(btnAddExercicio);

    return card;
}

function criarLinhaExercicio(ex) {
    const row = document.createElement('div');
    row.className = 'ts-exercicio-row';

    const info = document.createElement('div');
    info.className = 'ts-exercicio-info';

    const nome = document.createElement('span');
    nome.className = 'ts-exercicio-nome';
    nome.textContent = ex.nome;
    info.appendChild(nome);

    const partesDetalhe = [];
    if (ex.series) partesDetalhe.push(`${ex.series}x${ex.repeticoes || '?'}`);
    else if (ex.repeticoes) partesDetalhe.push(ex.repeticoes);
    if (ex.carga) partesDetalhe.push(ex.carga);

    if (partesDetalhe.length) {
        const detalhes = document.createElement('span');
        detalhes.className = 'ts-exercicio-detalhes';
        detalhes.textContent = partesDetalhe.join(' · ');
        info.appendChild(detalhes);
    }

    if (ex.observacoes) {
        const obs = document.createElement('span');
        obs.className = 'ts-exercicio-obs';
        obs.textContent = ex.observacoes;
        info.appendChild(obs);
    }

    const actions = document.createElement('div');
    actions.className = 'ts-exercicio-actions';

    const btnEditar = document.createElement('button');
    btnEditar.type = 'button';
    btnEditar.className = 'btn-ts-icon';
    btnEditar.textContent = 'Editar';
    btnEditar.addEventListener('click', () => abrirModalExercicio(ex, ex.blocoId));

    actions.appendChild(btnEditar);
    row.appendChild(info);
    row.appendChild(actions);
    return row;
}

function atualizarKpisTreino() {
    document.getElementById('kpiTreinoBlocos').textContent = stateTS.blocos.length;
    const totalExercicios = stateTS.blocos.reduce((s, b) => s + b.exercicios.length, 0);
    document.getElementById('kpiTreinoExercicios').textContent = totalExercicios;
}

function initModalBloco() {
    document.getElementById('btnNovoBloco').addEventListener('click', () => abrirModalBloco(null));
    document.getElementById('modalBlocoClose').addEventListener('click', fecharModalBloco);
    document.getElementById('btnBlocoCancelar').addEventListener('click', fecharModalBloco);
    document.getElementById('modalBlocoOverlay').addEventListener('click', (e) => {
        if (e.target.id === 'modalBlocoOverlay') fecharModalBloco();
    });
    document.getElementById('blocoForm').addEventListener('submit', salvarBloco);
    document.getElementById('btnBlocoExcluir').addEventListener('click', excluirBloco);
}

function abrirModalBloco(bloco, diaSemanaPadrao) {
    stateTS.editBlocoId = bloco ? bloco.id : null;
    document.getElementById('modalBlocoTitle').textContent = bloco ? 'Editar Bloco' : 'Novo Bloco';
    document.getElementById('btnBlocoExcluir').style.display = bloco ? 'inline-flex' : 'none';
    document.getElementById('formBlocoId').value = bloco ? bloco.id : '';
    document.getElementById('inputBlocoNome').value = bloco ? bloco.nome : '';
    document.getElementById('inputBlocoDia').value = bloco ? (bloco.diaSemana || '') : (diaSemanaPadrao || '');
    document.getElementById('inputBlocoObs').value = bloco ? (bloco.observacoes || '') : '';
    document.getElementById('modalBlocoOverlay').classList.add('active');
}

function fecharModalBloco() {
    document.getElementById('modalBlocoOverlay').classList.remove('active');
}

async function salvarBloco(e) {
    e.preventDefault();
    const payload = {
        nome: document.getElementById('inputBlocoNome').value.trim(),
        diaSemana: document.getElementById('inputBlocoDia').value || null,
        observacoes: document.getElementById('inputBlocoObs').value.trim()
    };

    try {
        const id = stateTS.editBlocoId;
        const resp = await fetch(id ? `${API_BASE}/treinos/blocos/${id}` : `${API_BASE}/treinos/blocos`, {
            method: id ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!resp.ok) throw new Error('Falha ao salvar bloco');

        fecharModalBloco();
        await carregarBlocos();
    } catch (err) {
        alert(`Não foi possível salvar o bloco. ${err.message}`);
    }
}

async function excluirBloco() {
    if (!stateTS.editBlocoId) return;
    if (!confirm('Excluir este bloco e todos os seus exercícios?')) return;

    try {
        const resp = await fetch(`${API_BASE}/treinos/blocos/${stateTS.editBlocoId}`, { method: 'DELETE' });
        if (!resp.ok) throw new Error('Falha ao excluir bloco');

        fecharModalBloco();
        await carregarBlocos();
    } catch (err) {
        alert(`Não foi possível excluir o bloco. ${err.message}`);
    }
}

function initModalExercicio() {
    document.getElementById('modalExercicioClose').addEventListener('click', fecharModalExercicio);
    document.getElementById('btnExercicioCancelar').addEventListener('click', fecharModalExercicio);
    document.getElementById('modalExercicioOverlay').addEventListener('click', (e) => {
        if (e.target.id === 'modalExercicioOverlay') fecharModalExercicio();
    });
    document.getElementById('exercicioForm').addEventListener('submit', salvarExercicio);
    document.getElementById('btnExercicioExcluir').addEventListener('click', excluirExercicio);
}

function abrirModalExercicio(exercicio, blocoId) {
    stateTS.editExercicioId = exercicio ? exercicio.id : null;
    stateTS.exercicioBlocoAtivoId = blocoId;
    document.getElementById('modalExercicioTitle').textContent = exercicio ? 'Editar Exercício' : 'Novo Exercício';
    document.getElementById('btnExercicioExcluir').style.display = exercicio ? 'inline-flex' : 'none';
    document.getElementById('formExercicioId').value = exercicio ? exercicio.id : '';
    document.getElementById('formExercicioBlocoId').value = blocoId;
    document.getElementById('inputExercicioNome').value = exercicio ? exercicio.nome : '';
    document.getElementById('inputExercicioSeries').value = (exercicio && exercicio.series !== null && exercicio.series !== undefined) ? exercicio.series : '';
    document.getElementById('inputExercicioRepeticoes').value = exercicio ? (exercicio.repeticoes || '') : '';
    document.getElementById('inputExercicioCarga').value = exercicio ? (exercicio.carga || '') : '';
    document.getElementById('inputExercicioObs').value = exercicio ? (exercicio.observacoes || '') : '';
    document.getElementById('modalExercicioOverlay').classList.add('active');
}

function fecharModalExercicio() {
    document.getElementById('modalExercicioOverlay').classList.remove('active');
}

async function salvarExercicio(e) {
    e.preventDefault();
    const blocoId = stateTS.exercicioBlocoAtivoId;

    const payload = {
        nome: document.getElementById('inputExercicioNome').value.trim(),
        series: document.getElementById('inputExercicioSeries').value,
        repeticoes: document.getElementById('inputExercicioRepeticoes').value.trim(),
        carga: document.getElementById('inputExercicioCarga').value.trim(),
        observacoes: document.getElementById('inputExercicioObs').value.trim()
    };

    try {
        const id = stateTS.editExercicioId;
        const url = id ? `${API_BASE}/treinos/exercicios/${id}` : `${API_BASE}/treinos/blocos/${blocoId}/exercicios`;
        const resp = await fetch(url, {
            method: id ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!resp.ok) throw new Error('Falha ao salvar exercício');

        fecharModalExercicio();
        await carregarBlocos();
    } catch (err) {
        alert(`Não foi possível salvar o exercício. ${err.message}`);
    }
}

async function excluirExercicio() {
    if (!stateTS.editExercicioId) return;
    if (!confirm('Deseja realmente excluir este exercício?')) return;

    try {
        const resp = await fetch(`${API_BASE}/treinos/exercicios/${stateTS.editExercicioId}`, { method: 'DELETE' });
        if (!resp.ok) throw new Error('Falha ao excluir exercício');

        fecharModalExercicio();
        await carregarBlocos();
    } catch (err) {
        alert(`Não foi possível excluir o exercício. ${err.message}`);
    }
}

// =========================================================
// ABA 2: SAÚDE
// =========================================================

async function carregarSaude() {
    try {
        const resp = await fetch(`${API_BASE}/saude/registros`);
        if (!resp.ok) throw new Error('Erro ao buscar registros de saúde');
        stateTS.registrosSaude = await resp.json();
        renderSaude();
        atualizarKpisSaude();
    } catch (err) {
        console.warn('[Treinos & Saúde] Erro ao carregar registros de saúde.', err.message);
    }
}

function renderSaude() {
    const tbody = document.getElementById('saudeTableBody');
    tbody.innerHTML = '';

    if (!stateTS.registrosSaude.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="ts-table-empty">Nenhum registro de saúde cadastrado.</td></tr>';
        return;
    }

    stateTS.registrosSaude.forEach(r => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${formatarDataBR(r.data)}</td>
            <td>${(r.peso !== null && r.peso !== undefined) ? `${r.peso} kg` : '—'}</td>
            <td>${(r.cintura !== null && r.cintura !== undefined) ? `${r.cintura} cm` : '—'}</td>
            <td>${(r.aguaMl !== null && r.aguaMl !== undefined) ? `${r.aguaMl} ml` : '—'}</td>
            <td>${(r.sonoHoras !== null && r.sonoHoras !== undefined) ? `${r.sonoHoras}h` : '—'}</td>
            <td>${escapeHtml(r.observacoes || '—')}</td>
            <td>
                <div class="ts-table-actions">
                    <button type="button" class="btn-ts-icon" data-editar-saude="${r.id}">Editar</button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll('[data-editar-saude]').forEach(btn => {
        btn.addEventListener('click', () => {
            const registro = stateTS.registrosSaude.find(r => r.id === Number(btn.dataset.editarSaude));
            abrirModalSaude(registro);
        });
    });
}

function atualizarKpisSaude() {
    const ordenadosPorData = [...stateTS.registrosSaude].sort((a, b) => new Date(b.data) - new Date(a.data));
    const comPeso = ordenadosPorData.filter(r => r.peso !== null && r.peso !== undefined);

    if (comPeso.length) {
        document.getElementById('kpiSaudePesoAtual').textContent = `${comPeso[0].peso} kg`;
        if (comPeso.length > 1) {
            const variacao = comPeso[0].peso - comPeso[1].peso;
            const sinal = variacao > 0 ? '+' : '';
            document.getElementById('kpiSaudePesoVariacao').textContent = `${sinal}${variacao.toFixed(1)} kg desde o último registro`;
        } else {
            document.getElementById('kpiSaudePesoVariacao').textContent = 'Primeiro registro';
        }
    } else {
        document.getElementById('kpiSaudePesoAtual').textContent = '—';
        document.getElementById('kpiSaudePesoVariacao').textContent = 'Sem registros ainda';
    }

    const seteDiasAtras = new Date();
    seteDiasAtras.setDate(seteDiasAtras.getDate() - 7);
    const ultimos7 = stateTS.registrosSaude.filter(r => new Date(r.data) >= seteDiasAtras);

    const aguaValores = ultimos7.filter(r => r.aguaMl !== null && r.aguaMl !== undefined).map(r => r.aguaMl);
    const mediaAgua = aguaValores.length ? Math.round(aguaValores.reduce((s, v) => s + v, 0) / aguaValores.length) : 0;
    document.getElementById('kpiSaudeAguaMedia').textContent = `${mediaAgua} ml`;

    const sonoValores = ultimos7.filter(r => r.sonoHoras !== null && r.sonoHoras !== undefined).map(r => r.sonoHoras);
    const mediaSono = sonoValores.length ? (sonoValores.reduce((s, v) => s + v, 0) / sonoValores.length).toFixed(1) : 0;
    document.getElementById('kpiSaudeSonoMedia').textContent = `${mediaSono}h`;
}

function initModalSaude() {
    document.getElementById('btnNovoRegistroSaude').addEventListener('click', () => abrirModalSaude(null));
    document.getElementById('modalSaudeClose').addEventListener('click', fecharModalSaude);
    document.getElementById('btnSaudeCancelar').addEventListener('click', fecharModalSaude);
    document.getElementById('modalSaudeOverlay').addEventListener('click', (e) => {
        if (e.target.id === 'modalSaudeOverlay') fecharModalSaude();
    });
    document.getElementById('saudeForm').addEventListener('submit', salvarRegistroSaude);
    document.getElementById('btnSaudeExcluir').addEventListener('click', excluirRegistroSaude);
}

function abrirModalSaude(registro) {
    stateTS.editSaudeId = registro ? registro.id : null;
    document.getElementById('modalSaudeTitle').textContent = registro ? 'Editar Registro' : 'Novo Registro';
    document.getElementById('btnSaudeExcluir').style.display = registro ? 'inline-flex' : 'none';
    document.getElementById('formSaudeId').value = registro ? registro.id : '';
    document.getElementById('inputSaudeData').value = registro ? isoParaInputDate(registro.data) : hojeInputDate();
    document.getElementById('inputSaudePeso').value = (registro && registro.peso !== null && registro.peso !== undefined) ? registro.peso : '';
    document.getElementById('inputSaudeCintura').value = (registro && registro.cintura !== null && registro.cintura !== undefined) ? registro.cintura : '';
    document.getElementById('inputSaudeAgua').value = (registro && registro.aguaMl !== null && registro.aguaMl !== undefined) ? registro.aguaMl : '';
    document.getElementById('inputSaudeSono').value = (registro && registro.sonoHoras !== null && registro.sonoHoras !== undefined) ? registro.sonoHoras : '';
    document.getElementById('inputSaudeObs').value = registro ? (registro.observacoes || '') : '';
    document.getElementById('modalSaudeOverlay').classList.add('active');
}

function fecharModalSaude() {
    document.getElementById('modalSaudeOverlay').classList.remove('active');
}

async function salvarRegistroSaude(e) {
    e.preventDefault();
    const payload = {
        data: document.getElementById('inputSaudeData').value,
        peso: document.getElementById('inputSaudePeso').value,
        cintura: document.getElementById('inputSaudeCintura').value,
        aguaMl: document.getElementById('inputSaudeAgua').value,
        sonoHoras: document.getElementById('inputSaudeSono').value,
        observacoes: document.getElementById('inputSaudeObs').value.trim()
    };

    try {
        const id = stateTS.editSaudeId;
        const resp = await fetch(id ? `${API_BASE}/saude/registros/${id}` : `${API_BASE}/saude/registros`, {
            method: id ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!resp.ok) throw new Error('Falha ao salvar registro');

        fecharModalSaude();
        await carregarSaude();
    } catch (err) {
        alert(`Não foi possível salvar o registro. ${err.message}`);
    }
}

async function excluirRegistroSaude() {
    if (!stateTS.editSaudeId) return;
    if (!confirm('Deseja realmente excluir este registro?')) return;

    try {
        const resp = await fetch(`${API_BASE}/saude/registros/${stateTS.editSaudeId}`, { method: 'DELETE' });
        if (!resp.ok) throw new Error('Falha ao excluir registro');

        fecharModalSaude();
        await carregarSaude();
    } catch (err) {
        alert(`Não foi possível excluir o registro. ${err.message}`);
    }
}

// =========================================================
// UTILITÁRIOS
// =========================================================

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
