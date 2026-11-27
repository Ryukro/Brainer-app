// Mises à jour de l'appli (REGLES.md §9) : à l'ouverture, au retour dans l'appli et toutes les 30 minutes,
// le hub demande au serveur s'il existe une nouvelle version. Le service worker la télécharge en entier,
// puis une bannière propose « Mettre à jour » (jamais pendant une partie). Un appui recharge l'appli.

let enregistrement = null;
let prete = false;          // une nouvelle version attend
let bloquee = () => false;  // vrai pendant une partie

function banniere() {
  const deja = document.querySelector('.maj');
  if (bloquee()) { deja?.remove(); return; }   // jamais pendant une partie : elle reviendra au prochain écran
  if (!prete || deja) return;
  const b = document.createElement('div');
  b.className = 'maj'; b.setAttribute('role', 'status');
  b.innerHTML = '<span>Nouvelle version de Brainer</span><button class="btn principal">Mettre à jour</button>';
  b.querySelector('button').addEventListener('click', () => {
    b.querySelector('button').disabled = true;
    (enregistrement?.waiting)?.postMessage({ type: 'activer' });
  });
  document.body.append(b);
}

function suivre(sw) {
  if (!sw) return;
  const fini = () => { if (sw.state === 'installed' && navigator.serviceWorker.controller) { prete = true; banniere(); } };
  sw.addEventListener('statechange', fini);
  fini();
}

// À appeler après chaque changement d'écran et au lancement d'une partie : affiche ou retire la bannière.
export const reafficher = () => banniere();

export async function demarrerMaj(estEnPartie) {
  bloquee = estEnPartie;
  if (!('serviceWorker' in navigator) || !location.protocol.startsWith('http')) return;
  try {
    enregistrement = await navigator.serviceWorker.register('sw.js');
  } catch (e) { console.warn('Hors-ligne indisponible :', e); return; }
  let recharge = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // première installation : rien à recharger ; mise à jour acceptée : on recharge une seule fois
    if (prete && !recharge) { recharge = true; location.reload(); }
  });
  if (enregistrement.waiting && navigator.serviceWorker.controller) { prete = true; banniere(); }
  suivre(enregistrement.installing);
  enregistrement.addEventListener('updatefound', () => suivre(enregistrement.installing));
  const verifier = () => enregistrement.update().catch(() => {});
  document.addEventListener('visibilitychange', () => { if (!document.hidden) verifier(); });
  setInterval(verifier, 30 * 60 * 1000);
  verifier();
}

// « Rechercher une mise à jour » (Réglages) : 'disponible', 'a-jour' ou 'indisponible'.
export async function rechercherMaj() {
  if (!enregistrement) return 'indisponible';
  try { await enregistrement.update() } catch (e) { return 'indisponible' }
  const installe = enregistrement.installing;
  if (installe) await new Promise(ok => {
    const fin = () => { if (installe.state !== 'installing') { installe.removeEventListener('statechange', fin); ok(); } };
    installe.addEventListener('statechange', fin); fin();
  });
  if (enregistrement.waiting && navigator.serviceWorker.controller) { prete = true; banniere(); return 'disponible' }
  return 'a-jour';
}

// Version publiée (écrite par scripts/vitrine.py) ; absente dans l'atelier.
export async function versionPubliee() {
  try { const r = await fetch('version.json'); return r.ok ? await r.json() : null } catch (e) { return null }
}
