/**
 * JS/Calendario/calendario.js
 * Lógica do Módulo Calendário (Hub Pessoal): visões Mês/Semana/Dia,
 * criação/edição/exclusão de eventos e navegação de período.
 */

const API_BASE = '/api';
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const WEEKDAY_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const PX_POR_MINUTO = 48 / 60;

const stateCal = {
    view: 'month',
    currentDate: new Date(),
    eventos: [],
    editId: null
};

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initMobileNavigation();
    initToolbarNav();
    initModal();
    initViewSwitch();
});

// =========================================================
// NAVEGAÇÃO DE PERÍODO E TROCA DE VISÃO
// =========================================================

function initToolbarNav() {
    document.getElementById('btnCalHoje').addEventListener('click', () => {
        stateCal.currentDate = new Date();
        renderCurrentView();
    });
    document.getElementById('btnCalPrev').addEventListener('click', () => navigatePeriod(-1));
    document.getElementById('btnCalNext').addEventListener('click', () => navigatePeriod(1));
}

function navigatePeriod(direcao) {
    if (stateCal.view === 'month') {
        stateCal.currentDate = addMonths(stateCal.currentDate, direcao);
    } else if (stateCal.view === 'week') {
        stateCal.currentDate = addDays(stateCal.currentDate, direcao * 7);
    } else {
        stateCal.currentDate = addDays(stateCal.currentDate, direcao);
    }
    renderCurrentView();
}

function initViewSwitch() {
    document.querySelectorAll('.view-switch-btn').forEach(btn => {
        btn.addEventListener('click', () => setView(btn.dataset.view));
    });
    setView('month');
}

function setView(view) {
    stateCal.view = view;
    document.getElementById('calendarViews').dataset.view = view;
    document.querySelectorAll('.view-switch-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));

    renderCurrentView().then(() => {
        if (view === 'week') scrollToDefaultTime('weekTimeGrid');
        if (view === 'day') scrollToDefaultTime('dayTimeGrid');
    });
}

function scrollToDefaultTime(gridId) {
    const grid = document.getElementById(gridId);
    const wrap = grid ? grid.closest('.calendar-time-grid-wrap') : null;
    if (wrap) wrap.scrollTop = 7 * 48;
}

// =========================================================
// CARREGAMENTO E RENDERIZAÇÃO DAS VISÕES
// =========================================================

async function renderCurrentView() {
    let rangeStart, rangeEnd;

    if (stateCal.view === 'month') {
        rangeStart = startOfCalendarMonthGrid(stateCal.currentDate);
        rangeEnd = endOfCalendarMonthGrid(stateCal.currentDate);
    } else if (stateCal.view === 'week') {
        rangeStart = startOfWeek(stateCal.currentDate);
        rangeEnd = endOfDay(addDays(rangeStart, 6));
    } else {
        rangeStart = startOfDay(stateCal.currentDate);
        rangeEnd = endOfDay(stateCal.currentDate);
    }

    updatePeriodLabel();

    try {
        stateCal.eventos = await fetchEventos(rangeStart, rangeEnd);
    } catch (err) {
        console.warn('[Calendário] Não foi possível carregar os eventos.', err.message);
        stateCal.eventos = [];
    }

    if (stateCal.view === 'month') renderMonthView();
    else if (stateCal.view === 'week') renderWeekView();
    else renderDayView();
}

async function fetchEventos(inicio, fim) {
    const params = new URLSearchParams({ inicio: inicio.toISOString(), fim: fim.toISOString() });
    const resp = await fetch(`${API_BASE}/eventos?${params.toString()}`);
    if (!resp.ok) throw new Error('Erro ao buscar eventos');
    return resp.json();
}

function capitalizar(texto) {
    return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function updatePeriodLabel() {
    const label = document.getElementById('calPeriodoLabel');
    if (stateCal.view === 'month') {
        label.textContent = capitalizar(`${MESES[stateCal.currentDate.getMonth()]} de ${stateCal.currentDate.getFullYear()}`);
    } else if (stateCal.view === 'week') {
        const start = startOfWeek(stateCal.currentDate);
        const end = addDays(start, 6);
        label.textContent = capitalizar(`${start.getDate()} - ${end.getDate()} de ${MESES[end.getMonth()]} de ${end.getFullYear()}`);
    } else {
        label.textContent = capitalizar(`${stateCal.currentDate.getDate()} de ${MESES[stateCal.currentDate.getMonth()]} de ${stateCal.currentDate.getFullYear()}`);
    }
}

// --- Visão Mensal ---
function renderMonthView() {
    const grid = document.getElementById('monthGrid');
    grid.innerHTML = '';

    const gridStart = startOfCalendarMonthGrid(stateCal.currentDate);
    const gridEnd = endOfCalendarMonthGrid(stateCal.currentDate);
    const totalDias = Math.round((gridEnd - gridStart) / 86400000) + 1;
    const hoje = startOfDay(new Date());
    const mesAtivo = stateCal.currentDate.getMonth();

    for (let i = 0; i < totalDias; i++) {
        const dataCelula = addDays(gridStart, i);
        const cell = document.createElement('div');
        cell.className = 'calendar-day-cell';
        if (dataCelula.getMonth() !== mesAtivo) cell.classList.add('is-outside');
        if (isSameDay(dataCelula, hoje)) cell.classList.add('is-today');

        const numero = document.createElement('span');
        numero.className = 'calendar-day-number';
        numero.textContent = dataCelula.getDate();
        cell.appendChild(numero);

        const eventosWrap = document.createElement('div');
        eventosWrap.className = 'calendar-day-events';

        const eventosDoDia = stateCal.eventos
            .filter(ev => eventoSobrepoeDia(ev, dataCelula))
            .sort((a, b) => new Date(a.inicio) - new Date(b.inicio));

        const maxVisivel = 3;
        eventosDoDia.slice(0, maxVisivel).forEach(ev => {
            const chip = document.createElement('div');
            chip.className = 'calendar-event-chip';
            chip.style.backgroundColor = ev.cor || '#EEBB00';
            chip.textContent = ev.diaTodo ? ev.titulo : `${formatarHora(ev.inicio)} ${ev.titulo}`;
            chip.addEventListener('click', (e) => { e.stopPropagation(); openEditModal(ev); });
            eventosWrap.appendChild(chip);
        });

        if (eventosDoDia.length > maxVisivel) {
            const mais = document.createElement('div');
            mais.className = 'calendar-event-more';
            mais.textContent = `+${eventosDoDia.length - maxVisivel} mais`;
            mais.addEventListener('click', (e) => {
                e.stopPropagation();
                stateCal.currentDate = dataCelula;
                setView('day');
            });
            eventosWrap.appendChild(mais);
        }

        cell.appendChild(eventosWrap);
        cell.addEventListener('click', () => openCreateModal(dataCelula));
        grid.appendChild(cell);
    }
}

// --- Visões Semanal e Diária (Grade de Horários) ---
function renderWeekView() {
    const inicioSemana = startOfWeek(stateCal.currentDate);
    const dias = Array.from({ length: 7 }, (_, i) => addDays(inicioSemana, i));
    renderTimeGridCommon('weekTimeGrid', 'weekAllDayRow', dias);
}

function renderDayView() {
    renderTimeGridCommon('dayTimeGrid', 'dayAllDayRow', [startOfDay(stateCal.currentDate)]);
}

function renderTimeGridCommon(gridId, alldayId, dias) {
    const grid = document.getElementById(gridId);
    const alldayRow = document.getElementById(alldayId);

    grid.style.setProperty('--cal-cols', dias.length);
    alldayRow.style.setProperty('--cal-cols', dias.length);
    grid.innerHTML = '';
    alldayRow.innerHTML = '';

    const alldayGutter = document.createElement('div');
    alldayGutter.className = 'allday-gutter';
    alldayRow.appendChild(alldayGutter);

    const timeGutter = document.createElement('div');
    timeGutter.className = 'time-gutter';
    for (let h = 0; h < 24; h++) {
        const slot = document.createElement('div');
        slot.className = 'time-gutter-slot';
        slot.textContent = h === 0 ? '' : `${String(h).padStart(2, '0')}:00`;
        timeGutter.appendChild(slot);
    }
    grid.appendChild(timeGutter);

    const agora = new Date();

    dias.forEach(dia => {
        const alldayCol = document.createElement('div');
        alldayCol.className = 'allday-col';
        stateCal.eventos
            .filter(ev => ev.diaTodo && eventoSobrepoeDia(ev, dia))
            .forEach(ev => {
                const chip = document.createElement('div');
                chip.className = 'calendar-event-chip';
                chip.style.backgroundColor = ev.cor || '#EEBB00';
                chip.textContent = ev.titulo;
                chip.addEventListener('click', (e) => { e.stopPropagation(); openEditModal(ev); });
                alldayCol.appendChild(chip);
            });
        alldayRow.appendChild(alldayCol);

        const coluna = document.createElement('div');
        coluna.className = 'calendar-day-column';
        if (isSameDay(dia, agora)) coluna.classList.add('is-today');

        const header = document.createElement('div');
        header.className = 'calendar-day-column-header';
        header.textContent = `${WEEKDAY_SHORT[dia.getDay()]} ${dia.getDate()}`;
        coluna.appendChild(header);

        const slotsWrap = document.createElement('div');
        slotsWrap.style.position = 'relative';

        for (let h = 0; h < 24; h++) {
            const slot = document.createElement('div');
            slot.className = 'hour-slot';
            slot.addEventListener('click', () => openCreateModal(dia, h));
            slotsWrap.appendChild(slot);
        }

        stateCal.eventos
            .filter(ev => !ev.diaTodo && eventoSobrepoeDia(ev, dia))
            .forEach(ev => {
                const pos = calcularPosicaoEvento(ev, dia);
                const bloco = document.createElement('div');
                bloco.className = 'timed-event-block';
                bloco.style.backgroundColor = ev.cor || '#EEBB00';
                bloco.style.top = `${pos.top}px`;
                bloco.style.height = `${pos.height}px`;
                bloco.innerHTML = `<span class="timed-event-time">${formatarHora(ev.inicio)}</span>${escapeHtml(ev.titulo)}`;
                bloco.addEventListener('click', (e) => { e.stopPropagation(); openEditModal(ev); });
                slotsWrap.appendChild(bloco);
            });

        if (isSameDay(dia, agora)) {
            const linha = document.createElement('div');
            linha.className = 'current-time-line';
            linha.style.top = `${(agora.getHours() * 60 + agora.getMinutes()) * PX_POR_MINUTO}px`;
            slotsWrap.appendChild(linha);
        }

        coluna.appendChild(slotsWrap);
        grid.appendChild(coluna);
    });
}

function calcularPosicaoEvento(ev, dia) {
    const inicioDia = startOfDay(dia);
    const fimDia = addDays(inicioDia, 1);
    let inicio = new Date(ev.inicio);
    let fim = new Date(ev.fim);
    if (inicio < inicioDia) inicio = inicioDia;
    if (fim > fimDia) fim = fimDia;

    const minutosDoTopo = (inicio - inicioDia) / 60000;
    let duracaoMinutos = (fim - inicio) / 60000;
    if (duracaoMinutos < 30) duracaoMinutos = 30;

    return { top: minutosDoTopo * PX_POR_MINUTO, height: duracaoMinutos * PX_POR_MINUTO };
}

function eventoSobrepoeDia(ev, dia) {
    const inicioDia = startOfDay(dia).getTime();
    const fimDia = endOfDay(dia).getTime();
    const evInicio = new Date(ev.inicio).getTime();
    const evFim = new Date(ev.fim).getTime();
    return evInicio <= fimDia && evFim >= inicioDia;
}

// =========================================================
// MODAL DE CRIAÇÃO / EDIÇÃO DE EVENTO
// =========================================================

function initModal() {
    const overlay = document.getElementById('modalEventoOverlay');

    document.getElementById('btnNovoEventoHeader').addEventListener('click', () => openCreateModal(stateCal.currentDate));
    document.getElementById('btnNovoEventoToolbar').addEventListener('click', () => openCreateModal(stateCal.currentDate));
    document.getElementById('modalEventoClose').addEventListener('click', closeModal);
    document.getElementById('btnEventoCancelar').addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

    document.getElementById('inputEventoDiaTodo').addEventListener('change', toggleDiaTodoFields);

    document.querySelectorAll('.color-swatch').forEach(sw => {
        sw.addEventListener('click', () => {
            document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
            sw.classList.add('selected');
            document.getElementById('inputEventoCor').value = sw.dataset.color;
        });
    });

    document.getElementById('eventoForm').addEventListener('submit', handleSalvarEvento);
    document.getElementById('btnEventoExcluir').addEventListener('click', handleExcluirEvento);
}

function toggleDiaTodoFields() {
    const diaTodo = document.getElementById('inputEventoDiaTodo').checked;
    document.getElementById('inputEventoInicioHora').disabled = diaTodo;
    document.getElementById('inputEventoFimHora').disabled = diaTodo;
    if (diaTodo) {
        document.getElementById('inputEventoInicioHora').value = '00:00';
        document.getElementById('inputEventoFimHora').value = '23:59';
    }
}

function openCreateModal(dataBase, hora) {
    stateCal.editId = null;
    document.getElementById('modalEventoTitle').textContent = 'Novo Evento';
    document.getElementById('btnEventoExcluir').style.display = 'none';
    document.getElementById('eventoForm').reset();
    document.getElementById('formEventoId').value = '';
    document.getElementById('inputEventoInicioHora').disabled = false;
    document.getElementById('inputEventoFimHora').disabled = false;

    const base = dataBase || new Date();
    const horaInicial = (typeof hora === 'number') ? hora : Math.min(new Date().getHours() + 1, 23);
    const inicio = new Date(base.getFullYear(), base.getMonth(), base.getDate(), horaInicial, 0);
    const fim = new Date(inicio.getTime() + 60 * 60 * 1000);

    document.getElementById('inputEventoInicioData').value = formatarDataInput(inicio);
    document.getElementById('inputEventoInicioHora').value = formatarHoraInput(inicio);
    document.getElementById('inputEventoFimData').value = formatarDataInput(fim);
    document.getElementById('inputEventoFimHora').value = formatarHoraInput(fim);

    document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
    document.querySelector('.color-swatch[data-color="#EEBB00"]').classList.add('selected');
    document.getElementById('inputEventoCor').value = '#EEBB00';
    document.getElementById('inputEventoLembrete').value = '30';

    document.getElementById('modalEventoOverlay').classList.add('active');
    document.getElementById('inputEventoTitulo').focus();
}

function openEditModal(ev) {
    stateCal.editId = ev.id;
    document.getElementById('modalEventoTitle').textContent = 'Editar Evento';
    document.getElementById('btnEventoExcluir').style.display = 'inline-flex';
    document.getElementById('formEventoId').value = ev.id;
    document.getElementById('inputEventoTitulo').value = ev.titulo;
    document.getElementById('inputEventoLocal').value = ev.local || '';
    document.getElementById('inputEventoDescricao').value = ev.descricao || '';
    document.getElementById('inputEventoDiaTodo').checked = !!ev.diaTodo;

    const inicio = new Date(ev.inicio);
    const fim = new Date(ev.fim);
    document.getElementById('inputEventoInicioData').value = formatarDataInput(inicio);
    document.getElementById('inputEventoInicioHora').value = formatarHoraInput(inicio);
    document.getElementById('inputEventoFimData').value = formatarDataInput(fim);
    document.getElementById('inputEventoFimHora').value = formatarHoraInput(fim);
    document.getElementById('inputEventoInicioHora').disabled = !!ev.diaTodo;
    document.getElementById('inputEventoFimHora').disabled = !!ev.diaTodo;

    document.getElementById('inputEventoLembrete').value =
        (ev.lembreteMinutos === null || ev.lembreteMinutos === undefined) ? '' : String(ev.lembreteMinutos);

    const corAtual = (ev.cor || '#EEBB00').toLowerCase();
    document.querySelectorAll('.color-swatch').forEach(s => s.classList.toggle('selected', s.dataset.color.toLowerCase() === corAtual));
    document.getElementById('inputEventoCor').value = ev.cor || '#EEBB00';

    document.getElementById('modalEventoOverlay').classList.add('active');
}

function closeModal() {
    document.getElementById('modalEventoOverlay').classList.remove('active');
}

async function handleSalvarEvento(e) {
    e.preventDefault();

    const diaTodo = document.getElementById('inputEventoDiaTodo').checked;
    const inicioData = document.getElementById('inputEventoInicioData').value;
    const fimData = document.getElementById('inputEventoFimData').value;
    const inicioHora = diaTodo ? '00:00' : document.getElementById('inputEventoInicioHora').value;
    const fimHora = diaTodo ? '23:59' : document.getElementById('inputEventoFimHora').value;

    const inicio = combinarDataHora(inicioData, inicioHora);
    const fim = combinarDataHora(fimData, fimHora);

    if (fim < inicio) {
        alert('O fim do evento não pode ser antes do início.');
        return;
    }

    const lembreteValor = document.getElementById('inputEventoLembrete').value;

    const payload = {
        titulo: document.getElementById('inputEventoTitulo').value.trim(),
        descricao: document.getElementById('inputEventoDescricao').value.trim(),
        local: document.getElementById('inputEventoLocal').value.trim(),
        inicio: inicio.toISOString(),
        fim: fim.toISOString(),
        diaTodo,
        cor: document.getElementById('inputEventoCor').value,
        lembreteMinutos: lembreteValor === '' ? null : Number(lembreteValor)
    };

    try {
        const id = stateCal.editId;
        const resp = await fetch(id ? `${API_BASE}/eventos/${id}` : `${API_BASE}/eventos`, {
            method: id ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!resp.ok) throw new Error('Falha ao salvar evento');

        closeModal();
        renderCurrentView();
    } catch (err) {
        alert(`Não foi possível salvar o evento. ${err.message}`);
    }
}

async function handleExcluirEvento() {
    if (!stateCal.editId) return;
    if (!confirm('Deseja realmente excluir este evento?')) return;

    try {
        const resp = await fetch(`${API_BASE}/eventos/${stateCal.editId}`, { method: 'DELETE' });
        if (!resp.ok) throw new Error('Falha ao excluir evento');

        closeModal();
        renderCurrentView();
    } catch (err) {
        alert(`Não foi possível excluir o evento. ${err.message}`);
    }
}

// =========================================================
// UTILITÁRIOS DE DATA
// =========================================================

function startOfDay(data) {
    const d = new Date(data);
    d.setHours(0, 0, 0, 0);
    return d;
}

function endOfDay(data) {
    const d = new Date(data);
    d.setHours(23, 59, 59, 999);
    return d;
}

function addDays(data, dias) {
    const d = new Date(data);
    d.setDate(d.getDate() + dias);
    return d;
}

function addMonths(data, meses) {
    return new Date(data.getFullYear(), data.getMonth() + meses, 1);
}

function isSameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function startOfWeek(data) {
    const d = new Date(data.getFullYear(), data.getMonth(), data.getDate());
    d.setDate(d.getDate() - d.getDay());
    d.setHours(0, 0, 0, 0);
    return d;
}

function startOfCalendarMonthGrid(data) {
    const primeiroDia = new Date(data.getFullYear(), data.getMonth(), 1);
    return startOfWeek(primeiroDia);
}

function endOfCalendarMonthGrid(data) {
    const ultimoDia = new Date(data.getFullYear(), data.getMonth() + 1, 0);
    const fimSemana = startOfWeek(ultimoDia);
    fimSemana.setDate(fimSemana.getDate() + 6);
    return endOfDay(fimSemana);
}

function formatarDataInput(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatarHoraInput(d) {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function combinarDataHora(dataStr, horaStr) {
    const [ano, mes, dia] = dataStr.split('-').map(Number);
    const [h, min] = horaStr.split(':').map(Number);
    return new Date(ano, mes - 1, dia, h, min, 0);
}

function formatarHora(iso) {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
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
