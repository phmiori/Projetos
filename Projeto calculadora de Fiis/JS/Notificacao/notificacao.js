/**
 * JS/Notificacao/notificacao.js
 * Sino de Notificações do Cabeçalho (compartilhado por todos os módulos do Hub)
 * Busca periodicamente os lembretes de eventos do Calendário e alerta o usuário.
 */

const NOTIF_API = '/api/notificacoes';
const NOTIF_VISTOS_KEY = 'financehub_notificacoes_vistas';
const NOTIF_POLL_MS = 60000;

let ultimasNotificacoes = [];

document.addEventListener('DOMContentLoaded', () => {
    initNotificationBell();

    // Nas páginas dos demais módulos, o tema e o menu mobile já são inicializados
    // pelo script próprio do módulo. A Central de Notificações não possui módulo
    // próprio, então cuida da sua própria interface aqui (data-standalone-chrome).
    if (document.body.dataset.standaloneChrome === 'true') {
        initSharedTheme();
        initSharedMobileNavigation();
    }
});

function initSharedTheme() {
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

function initSharedMobileNavigation() {
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

function initNotificationBell() {
    const btn = document.getElementById('btnNotificacoes');
    const dropdown = document.getElementById('notificationDropdown');
    const menu = document.getElementById('notificationMenu');
    if (!btn || !dropdown || !menu) return;

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const aberto = dropdown.classList.toggle('open');
        btn.setAttribute('aria-expanded', aberto ? 'true' : 'false');
        if (aberto) marcarTodasComoVistas();
    });

    document.addEventListener('click', (e) => {
        if (!menu.contains(e.target)) {
            dropdown.classList.remove('open');
            btn.setAttribute('aria-expanded', 'false');
        }
    });

    carregarNotificacoes();
    setInterval(carregarNotificacoes, NOTIF_POLL_MS);
}

async function carregarNotificacoes() {
    try {
        const resp = await fetch(NOTIF_API);
        if (!resp.ok) throw new Error('Não autenticado ou indisponível');
        const notificacoes = await resp.json();

        ultimasNotificacoes = notificacoes;
        renderizarNotificacoes(notificacoes, document.getElementById('notificationList'));
        atualizarBadge(notificacoes);

        // Página Central de Notificações (quando presente)
        const listaPagina = document.getElementById('notificationPageList');
        if (listaPagina) renderizarNotificacoes(notificacoes, listaPagina, true);
    } catch (err) {
        console.warn('[Notificações] Não foi possível carregar.', err.message);

        const listaPagina = document.getElementById('notificationPageList');
        if (listaPagina) {
            listaPagina.innerHTML = '';
            const erro = document.createElement('p');
            erro.className = 'notification-empty';
            erro.textContent = 'Não foi possível carregar as notificações agora. Tente novamente mais tarde.';
            listaPagina.appendChild(erro);
        }
    }
}

function obterVistos() {
    try {
        return new Set(JSON.parse(localStorage.getItem(NOTIF_VISTOS_KEY) || '[]'));
    } catch {
        return new Set();
    }
}

function salvarVistos(vistos) {
    localStorage.setItem(NOTIF_VISTOS_KEY, JSON.stringify([...vistos]));
}

function marcarTodasComoVistas() {
    const vistos = obterVistos();
    ultimasNotificacoes.forEach(n => vistos.add(String(n.id)));
    salvarVistos(vistos);
    atualizarBadge(ultimasNotificacoes);
}

function atualizarBadge(notificacoes) {
    const badge = document.getElementById('notificationBadge');
    if (!badge) return;

    const vistos = obterVistos();
    const naoVistas = notificacoes.filter(n => !vistos.has(String(n.id))).length;

    if (naoVistas > 0) {
        badge.textContent = naoVistas > 9 ? '9+' : String(naoVistas);
        badge.style.display = 'flex';
    } else {
        badge.style.display = 'none';
    }
}

function renderizarNotificacoes(notificacoes, container, isPagina) {
    if (!container) return;
    container.innerHTML = '';

    if (!notificacoes.length) {
        const vazio = document.createElement('p');
        vazio.className = 'notification-empty';
        vazio.textContent = isPagina
            ? 'Nenhum lembrete ativo no momento. Configure um lembrete ao criar um evento no Calendário.'
            : 'Nenhuma notificação no momento.';
        container.appendChild(vazio);
        return;
    }

    notificacoes.forEach(n => container.appendChild(criarItemNotificacao(n)));
}

function criarItemNotificacao(n) {
    const item = document.createElement('div');
    item.className = 'notification-item';

    const dot = document.createElement('span');
    dot.className = 'notification-item-dot';
    dot.style.backgroundColor = n.cor || '#EEBB00';

    const body = document.createElement('div');
    body.className = 'notification-item-body';

    const titulo = document.createElement('span');
    titulo.className = 'notification-item-title';
    titulo.textContent = n.titulo;
    body.appendChild(titulo);

    const meta = document.createElement('span');
    meta.className = 'notification-item-meta';
    meta.textContent = formatarMetaNotificacao(n);
    body.appendChild(meta);

    if (n.local) {
        const local = document.createElement('span');
        local.className = 'notification-item-meta';
        local.textContent = `📍 ${n.local}`;
        body.appendChild(local);
    }

    if (n.emAndamento) {
        const tag = document.createElement('span');
        tag.className = 'notification-item-tag';
        tag.textContent = 'Em andamento';
        body.appendChild(tag);
    }

    item.appendChild(dot);
    item.appendChild(body);

    item.addEventListener('click', () => {
        window.location.href = resolverLinkCalendario();
    });

    return item;
}

function resolverLinkCalendario() {
    return window.location.pathname.includes('/HTML/Calendario/') ? 'calendario.html' : '../Calendario/calendario.html';
}

function formatarMetaNotificacao(n) {
    const inicio = new Date(n.inicio);
    const dataFormatada = inicio.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

    if (n.diaTodo) return `${dataFormatada} · Dia inteiro`;

    const hora = `${String(inicio.getHours()).padStart(2, '0')}:${String(inicio.getMinutes()).padStart(2, '0')}`;
    return `${dataFormatada} · ${hora}`;
}
