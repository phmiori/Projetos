/**
 * service-worker.js
 * Network-first para tudo (HTML/CSS/JS/ícones): sempre tenta buscar a versão mais nova da
 * rede primeiro, e só usa o cache como reserva se a rede falhar (ex.: sem internet). Isso
 * evita ficar preso servindo uma versão antiga da página depois de um deploy — o cache aqui
 * existe só para dar suporte a abrir o app offline, nunca para "acelerar" à custa de conteúdo
 * desatualizado. Bypass total para /api/* — os dados do hub nunca podem vir de cache.
 */

const CACHE_NAME = 'financehub-v3';
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.add(OFFLINE_URL))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((nomes) =>
            Promise.all(nomes.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('push', (event) => {
    let dados = {};
    try { dados = event.data ? event.data.json() : {}; } catch { /* payload não é JSON, ignora */ }

    const titulo = dados.title || 'FinanceHub';
    const opcoes = {
        body: dados.body || '',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        data: { url: dados.url || '/' }
    };

    event.waitUntil(self.registration.showNotification(titulo, opcoes));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const url = event.notification.data?.url || '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((janelas) => {
            for (const cliente of janelas) {
                if (cliente.url.includes(url) && 'focus' in cliente) return cliente.focus();
            }
            if (clients.openWindow) return clients.openWindow(url);
        })
    );
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) {
        return; // não intercepta chamadas de API nem de outras origens
    }

    event.respondWith(
        fetch(request).then((response) => {
            if (response.ok) {
                const copia = response.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(request, copia));
            }
            return response;
        }).catch(() =>
            caches.match(request).then((cached) => cached || (request.mode === 'navigate' ? caches.match(OFFLINE_URL) : undefined))
        )
    );
});
