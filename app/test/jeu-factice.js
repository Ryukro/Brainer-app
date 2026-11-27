// Jeu factice « Bulles » : sert à tester le cadre du hub, n'est pas un jeu de Brainer.
// Il montre le contrat complet d'un jeu (REGLES.md §1) : touche les bulles pleines, évite les leurres.

const r = (a, b) => a + Math.random() * (b - a);

// Charge fixe par niveau : nombre de bulles pleines en 2 minutes (= seuil de référence, partie parfaite).
const NIVEAUX = Array.from({ length: 10 }, (_, i) => {
  const L = i + 1;
  return { niveau: L, bulles: 20 + 6 * L, vie: 2.6 - 0.15 * L, leurres: 0.12 + 0.03 * L, seuil: 20 + 6 * L };
});

function fondDegrade(c, l, h, dpr) {
  const g = c.createLinearGradient(0, 0, 0, h * dpr);
  g.addColorStop(0, '#08241f'); g.addColorStop(1, '#0b1a2a');
  c.fillStyle = g; c.fillRect(0, 0, l * dpr, h * dpr);
}

export default {
  id: 'factice',
  nom: 'Bulles',
  categorie: 'rai',
  version: 'v0',
  accroche: 'Jeu de test du cadre commun.',
  couleur: { nuit: '#5fd6c8', jour: '#0a756b', contraste: '#00b386' },
  vie: '<path fill-rule="evenodd" d="M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17zM8.6 7.2a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/>',
  tutoriel: [
    { titre: 'Touche les bulles', texte: 'Des bulles pleines apparaissent. Touche-les avant qu’elles ne disparaissent.' },
    { titre: 'Évite les leurres', texte: 'Les bulles creuses sont des leurres : les toucher compte comme une erreur.' },
    { titre: 'Marque des points', texte: 'Chaque bulle touchée rapporte des points ; enchaîne-les sans erreur pour allonger ta série.' }
  ],
  modes: {
    niveaux: { objectif: 'Maîtrises-tu ce niveau ? 2 min.' },
    chrono: { nom: 'Écume', objectif: 'Combien de bulles en 2 min ?', charge: 10 },
    survie: { nom: 'Marée', objectif: 'Jusqu’où tiendras-tu ? Une bulle manquée coûte une vie. 3 vies.' }
  },
  niveaux: NIVEAUX,
  seuilAu: L => 20 + 6 * L,

  // Fond animé : bulles qui montent lentement.
  decor(canvas) {
    const c = canvas.getContext('2d');
    const bulles = Array.from({ length: 26 }, () => ({ x: Math.random(), y: Math.random(), v: r(0.02, 0.06), t: r(4, 14) }));
    let raf = 0, avant = performance.now();
    const dessiner = t => {
      const dt = Math.min(0.05, (t - avant) / 1000); avant = t;
      const dpr = canvas.width / Math.max(1, canvas.clientWidth), l = canvas.clientWidth, h = canvas.clientHeight;
      fondDegrade(c, l, h, dpr);
      for (const b of bulles) {
        b.y -= b.v * dt; if (b.y < -0.05) { b.y = 1.05; b.x = Math.random() }
        c.beginPath(); c.arc(b.x * l * dpr, b.y * h * dpr, b.t * dpr * Math.min(1, h / 300), 0, 7);
        c.fillStyle = 'rgba(95,214,200,.18)'; c.fill();
      }
      raf = requestAnimationFrame(dessiner);
    };
    raf = requestAnimationFrame(dessiner);
    return { arreter: () => cancelAnimationFrame(raf) };
  },

  partie({ canvas, mode, niveau, signaler, daltonisme }) {
    const c = canvas.getContext('2d');
    let L = mode === 'survie' ? 1 : niveau;
    let p = NIVEAUX[Math.min(L, 10) - 1];
    const bulles = [];
    let raf = 0, avant = performance.now(), horloge = 0, prochaine = 0.5, enPause = false, fin = false, creees = 0;
    let touchees = 0, leurresEvites = 0, reussitesNiveau = 0;
    const total = mode === 'niveaux' ? p.bulles : Infinity;
    const intervalle = () => (mode === 'niveaux' ? 118 / p.bulles : Math.max(0.35, 118 / p.bulles));
    const taille = () => Math.min(canvas.clientWidth, canvas.clientHeight) * 0.085;

    const ajouter = () => {
      const leurre = Math.random() < p.leurres;
      const R = taille(), l = canvas.clientWidth, h = canvas.clientHeight;
      bulles.push({ x: r(R, l - R), y: r(R, h - R), R, leurre, vie: p.vie, age: 0 });
      if (!leurre) creees++;
    };

    const dessiner = t => {
      const dt = Math.min(0.1, (t - avant) / 1000); avant = t;
      if (!enPause) {
        horloge += dt;
        if (!fin && horloge >= prochaine && creees < total) { ajouter(); prochaine = horloge + intervalle() }
        for (let i = bulles.length - 1; i >= 0; i--) {
          const b = bulles[i]; b.age += dt;
          if (b.age >= b.vie) {
            bulles.splice(i, 1);
            if (b.coupee) continue;
            if (b.leurre) leurresEvites++;
            else { signaler('erreur'); if (mode === 'survie') signaler('vie') }
          }
        }
        if (fin && !bulles.length) {
          fin = false; cancelAnimationFrame(raf); raf = 0;
          return signaler('fin', { stats: [
            { nom: 'Bulles touchées', valeur: mode === 'niveaux' ? `${touchees} / ${p.bulles}` : String(touchees) },
            { nom: 'Leurres évités', valeur: String(leurresEvites) }] });
        }
        if (mode === 'niveaux' && !fin && creees >= total && !bulles.length) { fin = true }
      }
      const dpr = canvas.width / Math.max(1, canvas.clientWidth);
      fondDegrade(c, canvas.clientWidth, canvas.clientHeight, dpr);
      for (const b of bulles) {
        const a = 1 - Math.max(0, (b.age - b.vie + 0.4) / 0.4);
        c.globalAlpha = Math.max(0, a);
        c.beginPath(); c.arc(b.x * dpr, b.y * dpr, b.R * dpr, 0, 7);
        if (b.leurre) { c.lineWidth = 4 * dpr; c.strokeStyle = '#9fb5c9'; c.stroke(); if (daltonisme) { c.beginPath(); c.moveTo((b.x - b.R / 2) * dpr, b.y * dpr); c.lineTo((b.x + b.R / 2) * dpr, b.y * dpr); c.stroke() } }
        else { c.fillStyle = '#5fd6c8'; c.fill() }
        c.globalAlpha = 1;
      }
      raf = requestAnimationFrame(dessiner);
    };
    raf = requestAnimationFrame(dessiner);

    const toucher = e => {
      if (enPause) return;
      const box = canvas.getBoundingClientRect(), x = e.clientX - box.left, y = e.clientY - box.top;
      for (let i = bulles.length - 1; i >= 0; i--) {
        const b = bulles[i];
        if ((x - b.x) ** 2 + (y - b.y) ** 2 <= (b.R * 1.15) ** 2) {
          bulles.splice(i, 1);
          if (b.leurre) signaler('erreur');
          else {
            touchees++; signaler('reussite', { niveau: L });
            if (mode === 'survie' && ++reussitesNiveau >= 8) { reussitesNiveau = 0; L++; p = L <= 10 ? NIVEAUX[L - 1] : { ...NIVEAUX[9], vie: Math.max(0.9, 1.1 - 0.03 * (L - 10)), bulles: 20 + 6 * L }; signaler('niveau', { niveau: L }) }
          }
          return;
        }
      }
    };
    canvas.addEventListener('pointerdown', toucher);

    return {
      pause() { enPause = true },
      reprendre() { enPause = false; avant = performance.now() },
      terminer() { fin = true; bulles.forEach(b => { b.vie = Math.min(b.vie, b.age + 0.4); b.coupee = true }) },
      arreter() { cancelAnimationFrame(raf); canvas.removeEventListener('pointerdown', toucher) }
    };
  }
};
