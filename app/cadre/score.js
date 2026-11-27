// Score commun (REGLES.md §5).
// Valeur d'une réussite au niveau L = 1 000 × L ÷ seuil de référence du niveau L.
// Au-delà du niveau 10 (Survie), le jeu peut fournir seuilAu(L) ; sinon le seuil du niveau 10 est gardé.

export function seuil(jeu, L) {
  if (L <= 10) return jeu.niveaux[Math.max(1, L) - 1].seuil;
  return typeof jeu.seuilAu === 'function' ? jeu.seuilAu(L) : jeu.niveaux[9].seuil;
}

export const valeur = (jeu, L) => (1000 * L) / seuil(jeu, L);

// Score maximal d'une partie : 1 000 × niveau en Niveaux, 1 000 × niveau de la charge en Chrono, aucun en Survie.
export function maximum(jeu, mode, niveau) {
  if (mode === 'niveaux') return 1000 * niveau;
  if (mode === 'chrono') return 1000 * (jeu.modes.chrono?.charge || 10);
  return null;
}

export const precision = (reussites, erreurs) => (reussites + erreurs ? reussites / (reussites + erreurs) : 0);
