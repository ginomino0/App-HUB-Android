// Service worker: requisito per l'installabilità PWA, funzionamento
// offline di base, e rilevamento automatico degli aggiornamenti.
//
// Strategia:
// - HTML e JS (index.html, app.js, jobs-data.js): "network first".
//   Prova sempre a scaricare la versione più recente da internet;
//   usa la cache solo come riserva se non c'è connessione. Così,
//   quando aggiorni il codice su GitHub, i visitatori con
//   connessione vedono subito l'aggiornamento (o ricevono il
//   banner "nuova versione disponibile" gestito da app.js).
// - Icone e manifest: "cache first" (cambiano raramente, meglio
//   veloci che sempre aggiornate).
// - Chiamate verso l'API Gemini: mai in cache, sempre in rete.

const CACHE_NAME = 'faidate-cache-v3';

const FILE_APP_SHELL = [
  './',
  './index.html',
  './app.js',
  './jobs-data.js'
];

const FILE_STATICI = [
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll([...FILE_APP_SHELL, ...FILE_STATICI])
    )
  );
  // Non attiviamo subito il nuovo worker: aspettiamo che sia
  // l'utente a confermare dal banner ("SKIP_WAITING"), così non
  // interrompiamo un lavoro in corso senza preavviso.
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

// Permette ad app.js di dire "attivati subito" quando l'utente
// clicca il bottone "OK, aggiorna" nel banner.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Mai in cache le chiamate verso l'API di Google/Gemini.
  if (url.hostname.includes('googleapis.com')) {
    return;
  }

  // Richieste di navigazione (apertura della pagina) e file JS/HTML
  // dell'app shell: network-first.
  const isNavigazione = event.request.mode === 'navigate';
  const isFileAppShell = isNavigazione || url.pathname.endsWith('.js') || url.pathname.endsWith('.html');

  if (isFileAppShell) {
    event.respondWith(
      fetch(event.request)
        .then((rispostaRete) => {
          const copia = rispostaRete.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copia));
          return rispostaRete;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Tutto il resto (icone, manifest, font esterni ecc.): cache-first.
  event.respondWith(
    caches.match(event.request).then((rispostaCache) => {
      return rispostaCache || fetch(event.request).catch(() => rispostaCache);
    })
  );
});
