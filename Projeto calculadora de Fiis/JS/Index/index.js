/**
 * JS/Index/index.js
 * Lógica do Módulo Index (Dashboard FinanceHub)
 * Gerenciamento de Tema Claro/Escuro, Navegação da Sidebar e Interatividades
 */

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initMobileNavigation();
    initSidebarModules();
    initDateDisplay();
});

/**
 * Gerenciamento do Tema Claro / Escuro com persistência via localStorage
 */
function initTheme() {
    const STORAGE_KEY = 'financehub_theme';
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    const themeLabel = document.getElementById('themeLabel');
    const rootElement = document.documentElement;

    // Recupera tema salvo ou utiliza 'dark' como padrão
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
        
        if (themeToggleBtn) {
            themeToggleBtn.setAttribute(
                'aria-label',
                theme === 'dark' ? 'Alternar para Modo Claro' : 'Alternar para Modo Escuro'
            );
        }
    }
}

/**
 * Controle de abertura e fechamento da Sidebar em telas móveis
 */
function initMobileNavigation() {
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const appSidebar = document.getElementById('appSidebar');
    const sidebarBackdrop = document.getElementById('sidebarBackdrop');

    if (!mobileMenuBtn || !appSidebar || !sidebarBackdrop) return;

    function toggleMenu() {
        const isOpen = appSidebar.classList.contains('open');
        if (isOpen) {
            closeMenu();
        } else {
            openMenu();
        }
    }

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

    mobileMenuBtn.addEventListener('click', toggleMenu);
    sidebarBackdrop.addEventListener('click', closeMenu);

    // Fecha a sidebar ao redimensionar para telas grandes
    window.addEventListener('resize', () => {
        if (window.innerWidth > 768 && appSidebar.classList.contains('open')) {
            closeMenu();
        }
    });
}

/**
 * Gerencia a seleção e estado ativo dos módulos na barra lateral
 */
function initSidebarModules() {
    const navButtons = document.querySelectorAll('.nav-item-btn');
    const appSidebar = document.getElementById('appSidebar');
    const sidebarBackdrop = document.getElementById('sidebarBackdrop');

    navButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            navButtons.forEach(item => item.classList.remove('active'));
            btn.classList.add('active');

            const moduleName = btn.getAttribute('data-module');
            console.info(`[FinanceHub] Módulo selecionado: ${moduleName}`);

            // Fecha a barra lateral no mobile após selecionar um módulo
            if (window.innerWidth <= 768 && appSidebar && appSidebar.classList.contains('open')) {
                appSidebar.classList.remove('open');
                if (sidebarBackdrop) sidebarBackdrop.classList.remove('active');
                document.body.style.overflow = '';
            }
        });
    });
}

/**
 * Exibe a data formatada no card de boas-vindas
 */
function initDateDisplay() {
    const dateElement = document.getElementById('currentDateDisplay');
    if (!dateElement) return;

    try {
        const today = new Date();
        const options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
        const formattedDate = today.toLocaleDateString('pt-BR', options);
        
        // Capitaliza a primeira letra
        dateElement.textContent = formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1);
    } catch (err) {
        dateElement.textContent = 'Hoje';
    }
}
