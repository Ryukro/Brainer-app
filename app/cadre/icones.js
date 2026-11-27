// Pictogrammes du cadre (trait, 24 × 24) : catégories et onglets du hub.
const TRACES = {
  mem: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  att: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',
  ctl: '<path d="M8 3h8l5 5v8l-5 5H8l-5-5V8z"/><path d="M8 12h8"/>',
  rai: '<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="M7.3 8.3l3.6 7.3M16.7 8.3l-3.6 7.3"/>',
  vis: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/>',
  num: '<path d="M10 4L8 20M16 4l-2 16M4.5 9h15M4 15h15"/>',
  jeux: '<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>',
  stats: '<path d="M5 20V11M12 20V4M19 20v-6"/>',
  reglages: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2.3"/><circle cx="8" cy="17" r="2.3"/>'
};

export const icone = (nom, classe = 'ico') =>
  `<svg class="${classe}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${TRACES[nom] || ''}</svg>`;

// Les 3 vies d'un jeu, dessinées avec son objet (contrat : jeu.vie = tracé SVG 24 × 24).
export const vies = (jeu, restantes, total = 3) =>
  Array.from({ length: total }, (_, i) => `<svg viewBox="0 0 24 24" class="${i < restantes ? '' : 'perdue'}" aria-hidden="true">${jeu.vie}</svg>`).join('');
