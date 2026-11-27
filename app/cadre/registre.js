// Registre des jeux branchés dans le hub et des catégories (CATALOGUE.md).
// Pour brancher un jeu porté : ajouter le chemin de son module à SOURCES (chemin relatif à ce fichier).

export const CATEGORIES = [
  { id: 'mem', nom: 'Mémoire', mesure: 'Retenir, restituer, mettre à jour' },
  { id: 'att', nom: 'Attention', mesure: 'Sélectionner, rester concentré' },
  { id: 'ctl', nom: 'Contrôle', mesure: 'Freiner un réflexe, changer de règle' },
  { id: 'rai', nom: 'Raisonnement', mesure: 'Déduire, planifier' },
  { id: 'vis', nom: 'Visuo-spatial', mesure: 'Formes, rotation, trajectoires' },
  { id: 'num', nom: 'Numérique', mesure: 'Calcul et estimation' }
];

const SOURCES = [
  '../../jeux/aiguillages/jeu.js',
  '../../jeux/averse/jeu.js',
];

// Le jeu factice sert à tester le cadre : présent tant qu'aucun jeu n'est branché, ou avec ?factice dans l'adresse.
const FACTICE = '../test/jeu-factice.js';

const CHAMPS = ['id', 'nom', 'categorie', 'version', 'couleur', 'vie', 'tutoriel', 'modes', 'niveaux', 'decor', 'partie'];

export async function chargerJeux() {
  const urls = [...SOURCES];
  if (!urls.length || new URLSearchParams(location.search).has('factice')) urls.push(FACTICE);
  const jeux = await Promise.all(urls.map(async u => {
    try {
      const j = (await import(u)).default;
      const manque = CHAMPS.filter(c => j[c] == null);
      if (manque.length) throw new Error(`champs manquants : ${manque.join(', ')}`);
      return j;
    } catch (e) { console.error(`Jeu non chargé (${u}) :`, e); return null }
  }));
  return jeux.filter(Boolean);
}

// Ordre d'affichage des modes et nom affiché (formule mixte, REGLES.md §3).
export const ORDRE_MODES = ['niveaux', 'chrono', 'survie'];
export const NOM_COMMUN = { niveaux: 'Niveaux', chrono: 'Chrono', survie: 'Survie' };
export const modesDu = jeu => ORDRE_MODES.filter(m => jeu.modes[m]);
export const nomDuMode = (jeu, m) => jeu.modes[m]?.nom || NOM_COMMUN[m];
