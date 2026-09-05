/**
 * service-worker.js
 * Cache-first para arquivos estáticos (CSS/JS/HTML/ícones), bypass total para /api/* — os
 * dados do hub (preços, saldos, notificações) nunca podem vir de um cache desatualizado.
 */

const CACHE_NAME = 'financehub-v1';

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((nomes) =>
            Promise.all(nomes.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
        ).then(() => self.clients.claim())
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
        caches.match(request).then((cached) => {
            if (cached) return cached;

            return fetch(request).then((response) => {
                if (response.ok) {
                    const copia = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, copia));
                }
                return response;
            }).catch(() => cached);
        })
    );
});
