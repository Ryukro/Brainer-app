// Averse — logique pure : paramètres des niveaux, calendrier des gouttes, calculs, score.
// Sans DOM ni canvas : importée par jeu.js (hub), testable sous Node (import('./coeur.js')).
// Reprise telle quelle de archives/averse-v15.html.
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

const Logic = (() => {
  const FALL = 12;                 // durée de chute fixe (s)
  const LEVELS = 10;
  const D_MIN = 3, D_MAX = 8;      // densité (gouttes en vol visées) au niveau 1 et au niveau 10
  const D_STEP = 0.5;              // Tempête au-delà du niveau 10 : +0,5 de densité par niveau…
  const D_SCREEN = 10;             // …jusqu'à la densité maximale lisible à l'écran (atteinte au niveau 14)
  const FALL_STEP = 0.9;           // ensuite, chaque niveau raccourcit la chute de 10 % (sans plafond)
  const LEVEL_TIME = 120;          // mode Niveaux : 2 min, dont une rafale finale
  const DELUGE = 15;               // durée de la rafale de fin de niveau en Tempête (s) : 25 % de chaque minute
  const DELUGE_NIV = 30;           // durée de la rafale en mode Niveaux (s) : 25 % des 2 min, même part qu'en Tempête
  const SURVIE_STEP = 60;          // Tempête (mode « Survie » de REGLES.md) : une minute par niveau (45 s de montée + 15 s de rafale)
  const SKIP_UNTIL = 8;            // montée rapide : une minute sans goutte au sol fait gagner 2 niveaux, arrivée au niveau 8 au plus
  const SPECIAL_EVERY = 30;        // goutte dorée toutes les 30 s
  const STREAK_S = 10;             // à partir de 10 gouttes d'affilée, chaque goutte compte double
  const ERROR_COST = 1;            // une erreur de saisie coûte le prix d'une goutte (1 point), quel que soit le moment
  const RARE_WEIGHT = 0.2;         // calculs avec 0 (+/−) ou 0/1 (×/÷) : 5 fois plus rares
  const SPACING = 0.4, SPACING_DELUGE = 0.3;
  const REG_SHARE = 0.6, REG_SHARE_DELUGE = 0.2;   // part du compte-gouttes régulier
  // Réserve de délais aléatoires, moyenne exactement 1 : même charge pour chaque partie, ordre différent
  const RANDOM_MULTS = [0.25, 0.35, 0.5, 0.6, 0.75, 0.9, 1, 1.15, 1.3, 1.6, 1.6, 2];
  const SYMS = ['+', '−', '×', '÷'];
  // Calculs : durcis aux niveaux 3, 6 et 9 (t = dernière table, multiplicateur de 0 à 10 dans les deux sens)
  const TIERS = [
    { add: 20, t: 10 },   // niveaux 1–2 : +/− 0–20, tables de 2 à 10
    { add: 20, t: 11 },   // niveaux 3–5 : + table de 11
    { add: 50, t: 12 },   // niveaux 6–8 : +/− 0–50, + table de 12
    { add: 50, t: 13 },   // niveaux 9–10 : + table de 13
  ];
  const tierOf = L => L <= 2 ? 0 : L <= 5 ? 1 : L <= 8 ? 2 : 3;
  // Densité d'un niveau : 3 → 8 du niveau 1 au niveau 10, puis +0,5 par niveau jusqu'à 10
  const densOf = L => L <= LEVELS ? D_MIN + (D_MAX - D_MIN) * (Math.max(L, 0) - 1) / (LEVELS - 1) : Math.min(D_SCREEN, D_MAX + D_STEP * (L - LEVELS));
  // Chute d'un niveau : 12 s, puis −10 % par niveau une fois la densité maximale atteinte
  const capLevel = LEVELS + (D_SCREEN - D_MAX) / D_STEP;   // 14
  const fallOf = L => FALL * Math.pow(FALL_STEP, Math.max(0, L - capLevel));
  // Rafale : densité + 2 (sans dépasser la densité maximale) ; si la densité est déjà maximale, chute −10 %
  const rafale = (dens, fall) => dens >= D_SCREEN ? { dens: D_SCREEN, fall: fall * FALL_STEP } : { dens: Math.min(D_SCREEN, dens + 2), fall };

  function shuffle(arr, rand) {
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
  }
  // Rafale de fin de niveau : 60 % de délais très courts, puis des pauses ; moyenne exactement 1
  function burstBag(n) {
    n = Math.max(2, n);
    const s = Math.floor(n * 0.6), long = (n - 0.25 * s) / (n - s);
    return [...Array(s).fill(0.25), ...Array(n - s).fill(long)];
  }

  // --- Tranches de temps : { t0, dur, dens, fall, deluge, level } ---
  function niveauxSegments(L) {
    const d = densOf(L), r = rafale(d, FALL);
    return [{ t0: 0, dur: LEVEL_TIME - DELUGE_NIV, dens: d, fall: FALL, deluge: false, level: L },
            { t0: LEVEL_TIME - DELUGE_NIV, dur: DELUGE_NIV, dens: r.dens, fall: r.fall, deluge: true, level: L }];
  }
  // Tempête : une minute au niveau L, à partir de t0. La densité et la chute vont de celles du niveau
  // quitté (fromL) à celles du niveau L en 3 marches de 15 s, puis 15 s de rafale.
  function survieSegments(L, t0, fromL) {
    const step = (SURVIE_STEP - DELUGE) / 3;
    const d0 = densOf(fromL), d1 = densOf(L), f0 = fallOf(Math.max(fromL, 1)), f1 = fallOf(L);
    const segs = [1, 3, 5].map((f, i) => ({ t0: t0 + i * step, dur: step, dens: lerp(d0, d1, f / 6), fall: lerp(f0, f1, f / 6), deluge: false, level: L }));
    const r = rafale(d1, f1);
    segs.push({ t0: t0 + SURVIE_STEP - DELUGE, dur: DELUGE, dens: r.dens, fall: r.fall, deluge: true, level: L });
    return segs;
  }
  // Niveau suivant en Tempête : +2 si la minute s'est passée sans goutte au sol (arrivée ≤ 8), sinon +1
  const nextSurvieLevel = (L, clean) => clean && L + 2 <= SKIP_UNTIL ? L + 2 : L + 1;

  // --- Calendrier : instants d'apparition, nombre fixe par tranche (équité) ---
  function segmentTimes(seg, rand) {
    const share = seg.deluge ? REG_SHARE_DELUGE : REG_SHARE;
    const regGap = seg.fall / (seg.dens * share), rndGap = seg.fall / (seg.dens * (1 - share));   // rythme = densité ÷ chute
    const times = [];
    const nReg = Math.round(seg.dur / regGap);
    for (let i = 0; i < nReg; i++) times.push(seg.t0 + (i + 0.5) * seg.dur / nReg);
    const nRnd = Math.round(seg.dur / rndGap);
    if (nRnd > 0) {
      let mults;
      if (seg.deluge) mults = shuffle(burstBag(nRnd), rand);
      else { const pool = shuffle(RANDOM_MULTS.slice(), rand); mults = Array.from({ length: nRnd }, (_, i) => pool[i % pool.length]); }
      const scale = seg.dur / mults.reduce((a, b) => a + b, 0);
      let acc = 0;
      for (const m of mults) { acc += m * scale; times.push(seg.t0 + acc - m * scale / 2); }
    }
    if (seg.deluge) times.push(seg.t0, seg.t0 + SPACING_DELUGE);   // 2 gouttes injectées dès le début de la rafale
    return times.sort((a, b) => a - b);
  }
  function schedule(segs, rand) { return segs.flatMap(s => segmentTimes(s, rand)).sort((a, b) => a - b); }
  function specialTimes(mode) { return mode === 'survie' ? null : [30, 60, 105]; }   // Niveaux : la 3e au milieu de la rafale ; Tempête : toutes les 30 s, sans fin

  // --- Calculs : pioche sans remise, pioche séparée pour les cas rares ---
  function combos(sym, T, special) {
    const out = [], add = (a, b, res, rare) => out.push({ a, b, res, rare });
    const lo = special ? 2 : 0, N = T.t;
    const inTables = (x, y) => x <= 10 || y <= 10;   // 11 × 7 oui, 11 × 12 non
    if (sym === '+') for (let a = 0; a <= T.add; a++) for (let b = 0; b <= T.add; b++) add(a, b, a + b, a === 0 || b === 0);
    if (sym === '−') for (let a = 0; a <= T.add; a++) for (let b = 0; b <= a; b++) add(a, b, a - b, b === 0);
    if (sym === '×') for (let a = lo; a <= N; a++) for (let b = lo; b <= N; b++) {
      if (!inTables(a, b) || (a <= 1 && b <= 1)) continue;   // jamais 0 × 0, 0 × 1, 1 × 1
      add(a, b, a * b, a <= 1 || b <= 1);
    }
    if (sym === '÷') for (let d = special ? 2 : 1; d <= N; d++) for (let q = special ? 1 : 0; q <= N; q++) {
      if (inTables(d, q)) add(d * q, d, q, d === 1 || d * q <= 1);
    }
    return out;
  }
  function createPicker(rand) {
    const pools = {}, bags = {};
    const drawFrom = (key, items) => { let b = bags[key]; if (!b || !b.length) b = bags[key] = shuffle(items.slice(), rand); return b.pop(); };
    function pick(sym, ti, special) {
      const id = `${sym}|${ti}|${special ? 1 : 0}`;
      let p = pools[id];
      if (!p) {
        const all = combos(sym, TIERS[ti], special);
        p = pools[id] = { common: all.filter(c => !c.rare), rare: all.filter(c => c.rare) };
        p.pRare = p.rare.length * RARE_WEIGHT / (p.rare.length * RARE_WEIGHT + p.common.length);
      }
      const useRare = p.rare.length && (!p.common.length || rand() < p.pRare);
      return useRare ? drawFrom(id + 'r', p.rare) : drawFrom(id + 'c', p.common);
    }
    // goutte dorée : toujours × ou ÷, jamais avec 0 ou 1
    return function makeOp(L, special) {
      const sym = special ? drawFrom('sym*', ['×', '÷']) : drawFrom('sym', SYMS);
      const c = pick(sym, tierOf(L), special);
      return { a: c.a, b: c.b, sym, res: c.res };
    };
  }

  // --- Score ---
  // Série = gouttes effacées d'affilée. Une goutte vaut 1, ou 2 si la série atteint déjà STREAK_S.
  const dropValue = streakBefore => streakBefore >= STREAK_S ? 2 : 1;
  const rawMax = n => n + Math.max(0, n - STREAK_S);
  // Niveaux : partie parfaite = 1 000 × niveau exactement
  const niveauxScore = (raw, n, L) => Math.round(1000 * L * raw / rawMax(n));
  // Unité commune à tous les modes : valeur d'un point (une goutte sans bonus) en mode Niveaux au niveau L.
  // Le nombre de gouttes d'une partie de Niveaux est fixe (calendrier à comptes fixes), donc l'unité aussi.
  const nivCount = L => schedule(niveauxSegments(L), Math.random).length + specialTimes('niveaux').length;
  const UNIT = Array.from({ length: LEVELS }, (_, i) => 1000 * (i + 1) / rawMax(nivCount(i + 1)));
  // Au-delà du niveau 10 (Tempête) : la valeur grandit comme le max des niveaux, × L / 10
  const unitOf = L => L <= LEVELS ? UNIT[Math.max(1, L) - 1] : UNIT[LEVELS - 1] * L / LEVELS;

  return { ERROR_COST, FALL, LEVELS, LEVEL_TIME, DELUGE, DELUGE_NIV, SURVIE_STEP, SPECIAL_EVERY, STREAK_S, SPACING, SPACING_DELUGE, D_SCREEN,
    densOf, fallOf, rafale, tierOf, niveauxSegments, survieSegments, nextSurvieLevel, segmentTimes, schedule, specialTimes,
    combos, createPicker, dropValue, rawMax, niveauxScore, burstBag, unitOf };
})();

export default Logic;
export { Logic, clamp, lerp };
