// Service worker de Brainer : l'app marche hors ligne après une première visite.
// Coquille et cadre pré-chargés à l'installation ; tout le reste (jeux, décors) gardé au passage.
// Stratégie : réponse immédiate depuis le cache, puis mise à jour en arrière-plan.
// Changer VERSION à chaque livraison du cadre pour purger l'ancien cache.
const VERSION = 'brainer-hub-3';
const COQUILLE = [
  './', 'index.html', 'manifest.webmanifest', 'icones/icone-192.png', 'icones/icone-512.png',
  'cadre/charte.css', 'cadre/app.js', 'cadre/ui.js', 'cadre/stockage.js', 'cadre/score.js',
  'cadre/registre.js', 'cadre/icones.js', 'cadre/ecrans/hub.js', 'cadre/ecrans/jeu.js', 'cadre/ecrans/partie.js', 'test/jeu-factice.js',
  'polices/fredoka-latin-400-normal.woff2', 'polices/fredoka-latin-500-normal.woff2',
  'polices/fredoka-latin-600-normal.woff2', 'polices/fredoka-latin-700-normal.woff2',
  'polices/atkinson-hyperlegible-latin-400-normal.woff2', 'polices/atkinson-hyperlegible-latin-700-normal.woff2'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(COQUILLE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(cles => Promise.all(cles.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  e.respondWith(caches.open(VERSION).then(async cache => {
    const garde = await cache.match(r, { ignoreSearch: r.mode === 'navigate' });
    const reseau = fetch(r).then(rep => {
      if (rep.ok) cache.put(r, rep.clone());
      return rep;
    }).catch(() => null);
    if (garde) { e.waitUntil(reseau); return garde; }
    const rep = await reseau;
    if (rep) return rep;
    if (r.mode === 'navigate') return (await cache.match('index.html')) || Response.error();
    return Response.error();
  }));
});
