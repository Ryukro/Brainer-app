// Service worker de Brainer : appli hors ligne et mises à jour d'un seul bloc (REGLES.md §1 et §9).
// Chaque version publiée a son propre cache, rempli en entier à l'installation (coquille, cadre, jeux publiés).
// Une nouvelle version s'installe en arrière-plan puis attend : le hub propose « Mettre à jour »
// (message « activer »), jamais au milieu d'une partie. Au tout premier passage, elle s'active seule.
//
// Le bloc ci-dessous est réécrit par scripts/vitrine.py à chaque publication (VERSION = empreinte des fichiers).
// Dans l'atelier (VERSION = 'dev'), le réseau passe d'abord pour voir tout de suite ses changements.
// <publication>
const VERSION = '0.2.0-ec35aeae8d05';
const FICHIERS = [
  "./",
  "cadre/app.js",
  "cadre/charte.css",
  "cadre/ecrans/hub.js",
  "cadre/ecrans/jeu.js",
  "cadre/ecrans/partie.js",
  "cadre/icones.js",
  "cadre/maj.js",
  "cadre/registre.js",
  "cadre/score.js",
  "cadre/stockage.js",
  "cadre/ui.js",
  "cadre/version.js",
  "icones/icone-192.png",
  "icones/icone-512.png",
  "index.html",
  "manifest.webmanifest",
  "polices/LICENCES.txt",
  "polices/atkinson-hyperlegible-latin-400-normal.woff2",
  "polices/atkinson-hyperlegible-latin-700-normal.woff2",
  "polices/fredoka-latin-400-normal.woff2",
  "polices/fredoka-latin-500-normal.woff2",
  "polices/fredoka-latin-600-normal.woff2",
  "polices/fredoka-latin-700-normal.woff2",
  "test/jeu-factice.js",
  "../jeux/aiguillages/coeur.js",
  "../jeux/aiguillages/jeu.js",
  "../jeux/averse/coeur.js",
  "../jeux/averse/jeu.js",
  "version.json",
];
// </publication>
const CACHE = `brainer-${VERSION}`;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE)
    .then(c => c.addAll(FICHIERS.map(u => new Request(u, { cache: 'reload' }))))
    .then(() => { if (!self.registration.active || VERSION === 'dev') return self.skipWaiting(); }));
});

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'activer') self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(cles => Promise.all(cles.filter(k => k.startsWith('brainer-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  const navigation = r.mode === 'navigate';
  e.respondWith(caches.open(CACHE).then(async cache => {
    const garde = await cache.match(r, { ignoreSearch: navigation });
    if (garde && VERSION !== 'dev') return garde;   // version publiée : toujours la copie de cette version
    try {
      const rep = await fetch(r);
      if (rep.ok) cache.put(r, rep.clone());
      return rep;
    } catch (err) {
      return garde || (navigation && await cache.match('index.html')) || Response.error();
    }
  }));
});
