// Stockage local de Brainer (REGLES.md §1 et §6). Toute lecture ou écriture est protégée :
// sans stockage (navigation privée, quota plein), l'app fonctionne, simplement sans mémoire.
//   brainer.reglages              réglages du hub
//   brainer.<jeu>.stats.v2        parties et records (format du hub)
//   brainer.<jeu>.journal         10 dernières parties avec leurs événements (calibrage)

const lire = (cle, defaut) => {
  try { const v = localStorage.getItem(cle); return v ? JSON.parse(v) : defaut } catch (e) { return defaut }
};
const ecrire = (cle, valeur) => {
  try { localStorage.setItem(cle, JSON.stringify(valeur)); return true } catch (e) { return false }
};

const REGLAGES = { son: true, vibrations: true, apparence: 'nuit', daltonisme: false, dev: false };
export const reglages = () => ({ ...REGLAGES, ...lire('brainer.reglages', {}) });
export const changerReglage = (cle, valeur) => { const r = reglages(); r[cle] = valeur; ecrire('brainer.reglages', r); return r };

// Identifiant de record : un par niveau en mode Niveaux, un par mode sinon.
// L'ancien identifiant « mort » (Mort subite) est lu comme « survie » (REGLES.md §3).
export const modeCommun = mode => (mode === 'mort' ? 'survie' : mode);
export const cleRecord = (mode, niveau) => (modeCommun(mode) === 'niveaux' ? `niveaux-${niveau}` : modeCommun(mode));

export function stats(id) {
  const s = lire(`brainer.${id}.stats.v2`, null) || { parties: [], records: {} };
  s.parties ||= []; s.records ||= {};
  return s;
}

export const record = (id, mode, niveau) => stats(id).records[cleRecord(mode, niveau)] || null;

// Enregistre une partie terminée ; renvoie { nouveauRecord }.
export function enregistrer(id, p) {
  const s = stats(id);
  const k = cleRecord(p.mode, p.niveau);
  const r = s.records[k] || { parties: 0, score: 0, serie: 0, niveau: 0 };
  const nouveauRecord = p.score > 0 && p.score > r.score;
  r.parties += 1;
  if (nouveauRecord) r.score = p.score;
  r.serie = Math.max(r.serie, p.serie || 0);
  if (p.niveauAtteint) r.niveau = Math.max(r.niveau || 0, p.niveauAtteint);
  s.records[k] = r;
  s.parties.push({ date: p.date, version: p.version, mode: modeCommun(p.mode), niveau: p.niveau, score: Math.round(p.score),
    max: p.max, precision: p.precision, serie: p.serie, niveauAtteint: p.niveauAtteint || null });
  if (s.parties.length > 500) s.parties.splice(0, s.parties.length - 500);
  ecrire(`brainer.${id}.stats.v2`, s);
  return { nouveauRecord };
}

// Reprise des stats d'un prototype (contrat : jeu.importer() facultatif, appelé une seule fois,
// renvoie { parties, records } au format v2 ou rien).
export function importerSiBesoin(jeu) {
  if (typeof jeu.importer !== 'function' || lire(`brainer.${jeu.id}.stats.v2`, null)) return;
  try {
    const s = jeu.importer();
    ecrire(`brainer.${jeu.id}.stats.v2`, { parties: s?.parties || [], records: s?.records || {} });
  } catch (e) { console.error(`[${jeu.id}] reprise des stats :`, e) }
}

export const journal = id => lire(`brainer.${id}.journal`, []);
export function ajouterAuJournal(id, entree) {
  const j = journal(id);
  j.push(entree);
  ecrire(`brainer.${id}.journal`, j.slice(-10));
}

// Toutes les données Brainer de ce navigateur (export) ; effacement complet.
export function toutesLesDonnees() {
  const out = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('brainer.')) out[k] = lire(k, null);
    }
  } catch (e) {}
  return out;
}
export function effacerTout() {
  try { Object.keys(toutesLesDonnees()).forEach(k => localStorage.removeItem(k)); return true } catch (e) { return false }
}
