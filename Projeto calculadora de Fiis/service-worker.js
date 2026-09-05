/**
 * service-worker.js
 * Network-first para tudo (HTML/CSS/JS/ícones): sempre tenta buscar a versão mais nova da
 * rede primeiro, e só usa o cache como reserva se a rede falhar (ex.: sem internet). Isso
 * evita ficar preso servindo uma versão antiga da página depois de um deploy — o cache aqui
 * existe só para dar suporte a abrir o app offline, nunca para "acelerar" à custa de conteúdo
 * desatualizado. Bypass total para /api/* — os dados do hub nunca podem vir de cache.
 */

const CACHE_NAME = 'financehub-v2';

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
        fetch(request).then((response) => {
            if (response.ok) {
                const copia = response.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(request, copia));
            }
            return response;
        }).catch(() => caches.match(request))
    );
});
