// JS/Global/pwa-register.js
// Registra o Service Worker (permite instalar o FinanceHub como app / PWA), incluído em todas as páginas.

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js').catch((err) => {
            console.warn('[PWA] Falha ao registrar o service worker:', err.message);
        });
    });
}
