// Service worker minimo: fa da requisito per l'installabilità PWA
// e mette in cache la pagina principale per un avvio offline di base.
// Le chiamate all'API Gemini (rete) non vengono mai messe in cache:
// passano sempre dritte a internet.

const CACHE_NAME = 'faidate-cache-v1';
const FILE_DA_CACHEARE = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(FILE_DA_CACHEARE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((nomi) =>
      Promise.all(
        nomi.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Non mettere mai in cache le chiamate verso l'API di Google/Gemini:
  // devono sempre andare in rete per dare risposte aggiornate.
  if (url.hostname.includes('googleapis.com')) {
    return; // lascia passare la richiesta normalmente
  }

  event.respondWith(
    caches.match(event.request).then((rispostaCache) => {
      return rispostaCache || fetch(event.request).catch(() => rispostaCache);
    })
  );
});
