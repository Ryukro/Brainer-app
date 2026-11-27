// Aiguillages — module du jeu pour le hub de Brainer (contrat : REGLES.md §1).
// Porté de jeux/aiguillages/aiguillages-v15.html (v15.5) : moteur, rendu et saisie repris tels quels ;
// menus, bandeau, pause, fin, stats et stockage sont désormais fournis par le cadre du hub.
import AIG from './coeur.js';

// ---------- Points de difficulté (v15.3 à v15.5, voir journal.md) : niveaux 1 à 10, paliers 11 à 20 du Terminus ----------
const PT = [null,
  { g: 4, prof: 2, tpm: 8, v: 1, mp: 1, w: 1, cw: 0, L0: 3 },   // 1
  { g: 4, prof: 2, tpm: 9, v: 1, mp: 1, w: 1, cw: 0, L0: 3 },   // 2
  { g: 5, prof: 2, tpm: 10, v: 1, mp: 2, w: 2, cw: 0, L0: 3 },   // 3
  { g: 5, prof: 2, tpm: 13, v: 1, mp: 2, w: 2, cw: 0, L0: 3 },   // 4
  { g: 5, prof: 3, tpm: 14, v: 1, mp: 2, w: 2, cw: 0, L0: 3 },   // 5
  { g: 6, prof: 3, tpm: 17, v: 1, mp: 2, w: 3, cw: 1, L0: 3 },   // 6
  { g: 7, prof: 4, tpm: 18, v: 1, mp: 3, w: 4, cw: 1, L0: 3 },   // 7
  { g: 8, prof: 5, tpm: 20, v: 1, mp: 3, w: 5, cw: 2, L0: 3 },   // 8
  { g: 10, prof: 6, tpm: 22, v: 1, mp: 3, w: 7, cw: 2, L0: 3 },   // 9
  { g: 11, prof: 7, tpm: 26, v: 1, mp: 3, w: 8, cw: 2, L0: 3 },   // 10
  { g: 12, prof: 7, tpm: 26, v: 1, mp: 3, w: 8, cw: 2, L0: 3 },   // 11 : g → 12
  { g: 12, prof: 7, tpm: 30, v: 1, mp: 3, w: 8, cw: 2, L0: 3 },   // 12 : tpm → 30
  { g: 12, prof: 8, tpm: 30, v: 1, mp: 3, w: 8, cw: 2, L0: 3 },   // 13 : prof → 8
  { g: 12, prof: 8, tpm: 30, v: 1, mp: 3, w: 10, cw: 2, L0: 3 },   // 14 : w → 10
  { g: 12, prof: 8, tpm: 34, v: 1, mp: 3, w: 10, cw: 2, L0: 3 },   // 15 : tpm → 34
  { g: 14, prof: 8, tpm: 34, v: 1, mp: 3, w: 10, cw: 2, L0: 3 },   // 16 : g → 14
  { g: 14, prof: 8, tpm: 34, v: 1, mp: 3, w: 10, cw: 3, L0: 3 },   // 17 : cw → 3
  { g: 14, prof: 9, tpm: 34, v: 1, mp: 3, w: 10, cw: 3, L0: 3 },   // 18 : prof → 9
  { g: 14, prof: 9, tpm: 38, v: 1, mp: 3, w: 10, cw: 3, L0: 3 },   // 19 : tpm → 38
  { g: 14, prof: 9, tpm: 38, v: 1, mp: 3, w: 12, cw: 3, L0: 3 },   // 20 : w → 12
];

const nTrainsDu = L => Math.round(PT[L].tpm * 2);

// Moteur d'une instance (décor animé de l'accueil, ou partie) dans un canvas.
// opts : { demo } pour le décor ; { gm: 'niveaux' | 'survie', level, signaler } pour une partie.
function moteur(cv, opts) {
  'use strict';
  const ctx = cv.getContext('2d');
  const { DC, DR, qpt, qtan } = AIG;

  // ---------- Points de difficulté v15.3 (26/11/2026) : points 1 à 10 de la v15.2, trafic durci aux points 6 à 10
  // (17, 18, 20, 22, 26 trains/min) ; paliers 11 à 20 adoucis, un seul changement par palier (proposition B), grappes de 3 ;
  // v15.5 (27/11/2026) : tunnel en portail de pierre (1,8 × 0,84 case, ouverture toujours sur les rails) ; ouvriers de chantier
  // pendant chaque construction (début de niveau, de point, nouvelles gares du Terminus) ; Terminus : chaque palier vaut
  // 1 000 points (score d'une partie sans raté = 1 000 × palier), au plus 6 trains payés par palier ; gares en U à auvents
  // (style autocollant, ouverture tournée vers la voie qui arrive, une seule teinte par gare) ----------
  // v15.4 (27/11/2026) : premier tronçon de 3 cases partout (temps de lecture du premier aiguillage) ----------
  // Ordonnancement : planchers physiques (labo du 24/11/2026). Chaque basculement nécessaire a une fenêtre (fin du verrou
  // laissé par le train précédent, et sortie du tunnel + tId) → (arrivée du train au centre) ; jouable si un tap tient dans
  // chaque fenêtre avec au moins tTap entre deux taps, et si chaque fenêtre dure au moins tMin.
  const ORD = { tTap: 0.35, tId: 1.5, tMin: 0.6, verrou: 0 };   // v15.1 : plus de verrou des aiguillages
  const LEVELS = 10, COLS = 5, ROWS = 8, S_SERIE = 10, BUILD = 3, OBSERVE = 3, GROW = 1.5, MARGIN = 0.85, COMMIT = 0.5;
  const MS_STEP = 6, MS_LIVES = 3, MS_SKIP_TO = 8, BAL_N = 30;   // Terminus : palier tous les 6 trains réussis, 3 vies ; Balayage : 30 trains par point
  const growDur = k => Math.max(0.9, 1.5 - (k - 3) / 12);
  const obsDur = k => Math.max(1, 3 - 0.15 * (k - 3));
  const DUREE = 120;   // niveaux : 2 minutes de trafic prévues
  const nTrains = L => Math.round(PT[L].tpm * 2);
  // score (v15.1) : b entier par train ; le bonus de série (après S_SERIE trains réussis d'affilée) complète pour que la
  // partie parfaite vaille exactement 1 000 × niveau : Bq points par train en bonus, 1 de plus pour les Br premiers
  const scoreOf = L => {
    const n = nTrains(L), nb = Math.max(1, n - S_SERIE), b = Math.floor(1000 * L / (n + nb / 2)), tot = 1000 * L - n * b;
    return { b, Bq: Math.floor(tot / nb), Br: tot % nb, S: S_SERIE };
  };
  const maxScore = L => 1000 * L;
  // Terminus : chaque palier vaut 1 000 points ; 6 trains à 10 % chacun, 40 % si aucun raté
  // dans le palier ; un palier sauté sans faute est crédité de sa valeur
  const palierVal = () => 1000;
  let gm = 'niveaux';   // mode : niveaux | survie (Terminus) | balayage (mode développeur)
  const ptOf = k => PT[Math.min(20, Math.max(1, k))];
  const pointNow = () => gm === 'niveaux' ? level : gm === 'balayage' ? S.point : S.palier;
  // valeur d'un train : niveau ≤ 10 ; au-delà (Terminus) : b et B du niveau 10 × palier ÷ 10
  const cur = () => {
    const k = pointNow(), p = ptOf(k);
    if (gm === 'survie') return { ...p, b: palierVal(k) / 10, Bq: 0, Br: 0, S: Infinity };
    return { ...p, ...scoreOf(Math.min(10, k)) };
  };
  const fmt = n => n.toLocaleString('fr-FR');

  // 15 couleurs, dans l'ordre le plus distinct (27/11/2026) : chaque début de liste maximise le plus petit écart entre
  // couleurs (pire des visions normale, deutéranope, protanope, tritanope ; vert du plateau compris). Un niveau à n gares
  // prend les n premières ; en Terminus, les gares reçoivent ces couleurs dans l'ordre où elles sont dévoilées.
  // Écart minimal : 36 à 4 gares, 22 à 8, 14 à 11, 10 à 12 ; les 3 dernières (crème, turquoise, ardoise) appellent un symbole.
  const STATIONS = [
    { col: '#f8f8f4' }, { col: '#8e4585' }, { col: '#000075' }, { col: '#f58231' }, { col: '#a9a9a9' }, { col: '#42d4f4' }, { col: '#ffe119' }, { col: '#4363d8' }, { col: '#26262b' }, { col: '#e6194b' }, { col: '#ff4f8b' }, { col: '#9a6324' }, { col: '#fffac8' }, { col: '#00c2a8' }, { col: '#5f7a8a' },
  ];
  // 0 blanc, 1 prune, 2 marine, 3 orange, 4 gris, 5 cyan, 6 jaune, 7 bleu, 8 noir, 9 rouge, 10 rose vif, 11 marron, 12 crème, 13 turquoise, 14 ardoise
  // paires trop proches (écart < 20 dans une des visions) : jamais côte à côte
  const SIMILAR = [[0, 12], [1, 11], [1, 14], [2, 8], [3, 10], [4, 10], [4, 13], [5, 13], [6, 12], [7, 14], [9, 11], [10, 13], [10, 14]];
  const COL = { board: '#4a7a43', track: '#1c3326', disc: '#2f3d34', discLocked: '#5d6560', ring: '#a9b3ab', open: '#e8ffb8', openLocked: '#d6d6d6',
               ballastDark: '#5f584c', ballast: '#8a8270', sleeper: '#5b3f2a', railDark: '#34373a', rail: '#d3d8dc' };
  function shade(hex, f) { const n = parseInt(hex.slice(1), 16); const k = v => clamp(Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f), 0, 255); return `rgb(${k(n >> 16)},${k((n >> 8) & 255)},${k(n & 255)})`; }

  const rnd = (a, b) => a + Math.random() * (b - a);
  const rint = (a, b) => Math.floor(rnd(a, b + 1));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = rint(0, i); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const easeBack = t => { const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

  // ---------- Plans (v15) : peigne sur la grille 5 × 8, profondeur aussi proche que possible de celle du point ----------
  function buildBoard(k, o = {}) {
    const p = ptOf(k), N = o.N || p.g, prof = o.prof || p.prof, L0 = o.L0 || p.L0;
    let best = null;
    for (let i = 0; (i < 60 || !best) && !(best && best.m.Pmax === prof); i++) {
      const partages = prof >= N - 1 ? 0 : [0, 1, 2][i % 3];
      const b = AIG.generatePeigne({ cols: COLS, rows: ROWS, N, L0, edge: Math.random() < 0.5 ? 'top' : 'bottom', col: [0, 2, 4][rint(0, 2)], partages, budget: 20000 });
      if (b && (!best || Math.abs(b.m.Pmax - prof) < Math.abs(best.m.Pmax - prof))) best = b;
    }
    const b = best;
    b.p = { L: k, v: p.v };
    b.routes = new Map(AIG.routesOf(b).map(r => [r.station, r]));
    assignColors(b);
    b.switches.forEach(s => { s.state = rint(0, 1); s.pulse = 0; s.deny = 0; s.locked = false; s.fixed = false; });
    b.nodes.forEach(n => { n.vis = true; n.grow = false; });
    b.maxD = Math.max(...b.stations.map(s => s.din + 0.5));
    return b;
  }
  // Terminus : dévoile les g premières gares ; renvoie les éléments nouvellement visibles
  function revealTo(b, g) {
    const was = new Set(b.nodes.filter(n => n.vis)), fixedBefore = new Set(b.switches.filter(s => s.fixed));
    AIG.reveal(b, g);
    b.routes = new Map(AIG.routesOf(b).map(r => [r.station, r]));
    b.maxD = Math.max(...b.stations.filter(s => s.vis).map(s => s.din + 0.5));
    const fresh = b.nodes.filter(n => n.vis && !was.has(n));
    // aiguillage qui s'ouvre : il était une voie fixe, sa nouvelle branche pousse
    const opened = b.switches.filter(s => s.vis && !s.fixed && fixedBefore.has(s) && was.has(s));
    return { fresh, opened };
  }
  function assignColors(b) {
    const N = b.N, st = b.stations;
    const sim = new Set(SIMILAR.filter(([a, c]) => a < N && c < N).flatMap(([a, c]) => [a + ',' + c, c + ',' + a]));
    const near = [];
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++)
      if (Math.max(Math.abs(st[i].c - st[j].c), Math.abs(st[i].r - st[j].r)) <= 3) near.push([i, j]);
    const ids = shuffle([...Array(N).keys()]);
    const cost = () => near.reduce((a, [i, j]) => a + (sim.has(ids[i] + ',' + ids[j]) ? 1 : 0), 0);
    let c = cost();
    for (let k = 0; k < 400 && c > 0; k++) {
      const i = rint(0, N - 1), j = rint(0, N - 1);
      [ids[i], ids[j]] = [ids[j], ids[i]];
      const c2 = cost();
      if (c2 <= c) c = c2; else [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    st.forEach((s, i) => { s.st = ids[i]; s.pulse = 0; s.bad = 0; });
  }

  // ---------- État ----------
  let board = null, nextBoard = null, level = clamp(opts.level || 1, 1, LEVELS);
  let S = null;
  let mode = 'menu';    // menu | demo | build | observe | playing | paused | ending | over
  let W = 0, H = 0, dpr = 1, cell = 40, ox = 0, oy = 0, bg = null;

  function prepareNext() { nextBoard = null; }
  // Terminus : un seul réseau de 14 gares (profondeur 9, premier tronçon de 3 cases), dévoilé gare par gare
  let termNext = null;
  function buildTerminus() { const b = buildBoard(20, { N: 14, prof: 9, L0: 3 }); b.term = true; return b; }

  function newGame() {
    const term = gm === 'survie', bal = gm === 'balayage';
    board = term ? (termNext && termNext.term ? termNext : buildTerminus()) : buildBoard(bal ? 1 : level);
    termNext = null; nextBoard = null;
    if (term) { AIG.revealOrder(board).forEach((st, k) => { st.st = k; }); revealTo(board, PT[1].g); }   // couleurs les plus distinctes d'abord
    S = { pt: 0, clock: 0, el: 0, trains: [], bag: [], dropper: null, ptSpawned: 0, lastDep: -9, tryT: 0,
          palier: 1, point: 1, pk: 0, clean: true, lives: MS_LIVES, hold: false, obs: OBSERVE, growDur: GROW,
          pts: bal ? [] : null, pOk: 0, pKo: 0, t10: null, run: 0, bonusK: 0,
          log: { v: 15.5, m: gm, L: gm === 'niveaux' ? level : 0, edge: board.edge, sw: board.switches.length, trains: [], taps: [], reveals: [], paliers: [], points: [] },
          score: 0, serie: 0, bestSerie: 0, ok: 0, ko: 0, particles: [], popups: [], endT: 0 };
    board.p.v = cur().v;
    bg = null;
    layout();
    mode = 'build';
    lastHud = ''; hud();
  }

  // ---------- Mise en page ----------
  const horizEdge = () => board && (board.edge === 'left' || board.edge === 'right');
  function layout() {
    W = cv.clientWidth; H = cv.clientHeight; dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    if (!board) return;
    const pad = 12, hz = horizEdge();
    const gw = board.cols + (hz ? MARGIN : 0), gh = board.rows + (hz ? 0 : MARGIN);
    cell = Math.min((W - 2 * pad) / gw, (H - 2 * pad) / gh);
    ox = (W - cell * gw) / 2 + (board.edge === 'left' ? MARGIN * cell : 0);
    oy = (H - cell * gh) / 2 + (board.edge === 'top' ? MARGIN * cell : 0);
    if (mode !== 'build') buildBg();
  }
  const X = gx => ox + gx * cell, Y = gy => oy + gy * cell;
  function mouth() { const e = board.entry, d = board.entry.inDir; return [e.c + 0.5 - DC[d] * 0.5, e.r + 0.5 - DR[d] * 0.5]; }
  function boardRect() {
    const e = board.edge, m = MARGIN * cell;
    let x = ox - 8, y = oy - 8, w = cell * board.cols + 16, h = cell * board.rows + 16;
    if (e === 'top') { y -= m; h += m; } if (e === 'bottom') h += m;
    if (e === 'left') { x -= m; w += m; } if (e === 'right') w += m;
    return [x, y, w, h];
  }

  function buildBg() {
    bg = document.createElement('canvas');
    bg.width = cv.width; bg.height = cv.height;
    const b = bg.getContext('2d'); b.scale(dpr, dpr);
    drawGround(b);
    drawNetwork(b, Infinity, true);
  }
  // herbe texturée + quelques arbres et rochers sur les cases libres (jamais au contact des voies)
  function drawGround(b) {
    const [x, y, w, h] = boardRect();
    if (!board.decor) {
      const R = AIG.makeRng(board.nodes.length * 7919 + board.entry.c * 31 + board.entry.r);
      const blades = [], patches = [], items = [];
      for (let i = 0; i < 90; i++) patches.push([R(), R(), 0.6 + R() * 1.4, R()]);
      for (let i = 0; i < 1400; i++) blades.push([R(), R(), R()]);
      for (let r = 0; r < board.rows; r++) for (let c = 0; c < board.cols; c++) {
        if (board.grid[r * board.cols + c]) continue;
        let near = false;
        for (let d = 0; d < 4; d++) { const nc = c + DC[d], nr = r + DR[d]; if (nc >= 0 && nr >= 0 && nc < board.cols && nr < board.rows && board.grid[nr * board.cols + nc]) near = true; }
        const z = board.zone, out = c < z.c || r < z.r || c >= z.c + z.cols || r >= z.r + z.rows;
        if (near || R() > (out ? 0.95 : 0.45)) continue;
        const k = out ? 1 + Math.floor(R() * 2) : 1;
        for (let j = 0; j < k; j++) items.push({ c: c + 0.25 + R() * 0.5, r: r + 0.25 + R() * 0.5, k: R() < (out ? 0.9 : 0.72) ? 'tree' : 'rock', s: (out ? 0.9 : 0.7) + R() * 0.5, v: R() });
      }
      board.decor = { blades, patches, items };
    }
    const D = board.decor;
    b.save();
    b.fillStyle = '#2f4f2c'; rr(b, x - 4, y - 4, w + 8, h + 8, 20); b.fill();
    const g = b.createRadialGradient(x + w / 2, y + h * 0.45, 10, x + w / 2, y + h / 2, Math.max(w, h) * 0.75);
    g.addColorStop(0, '#5a8a4c'); g.addColorStop(1, '#426e3b');
    b.fillStyle = g; rr(b, x, y, w, h, 16); b.fill();
    rr(b, x, y, w, h, 16); b.clip();
    for (const [px, py, s, v] of D.patches) { b.fillStyle = v < 0.5 ? 'rgba(30,60,25,.06)' : 'rgba(150,190,100,.05)'; b.beginPath(); b.ellipse(x + px * w, y + py * h, cell * s, cell * s * 0.6, v * 3, 0, 7); b.fill(); }
    b.lineWidth = 1.2; b.lineCap = 'round';
    { const z = board.zone; b.fillStyle = 'rgba(10,30,10,.16)';
      b.beginPath(); b.rect(x, y, w, h); b.rect(X(z.c) - cell * 0.12, Y(z.r) - cell * 0.12, (z.cols + 0.24) * cell, (z.rows + 0.24) * cell); b.fill('evenodd'); }
    for (const [px, py, v] of D.blades) { b.strokeStyle = v < 0.5 ? 'rgba(25,55,20,.28)' : 'rgba(170,210,120,.22)'; const xx = x + px * w, yy = y + py * h; b.beginPath(); b.moveTo(xx, yy); b.lineTo(xx + (v - 0.5) * 3, yy - 3 - v * 3); b.stroke(); }
    for (const it of D.items) {
      const cx = X(it.c), cy = Y(it.r), s = cell * 0.2 * it.s;
      if (it.k === 'tree') {
        b.fillStyle = 'rgba(0,0,0,.22)'; b.beginPath(); b.ellipse(cx + s * 0.35, cy + s * 0.45, s * 1.05, s * 0.85, 0, 0, 7); b.fill();
        b.fillStyle = '#2c5a2a'; b.beginPath(); b.arc(cx, cy, s, 0, 7); b.fill();
        b.fillStyle = '#3d7336'; b.beginPath(); b.arc(cx - s * 0.2, cy - s * 0.2, s * 0.72, 0, 7); b.fill();
        b.fillStyle = 'rgba(190,230,140,.28)'; b.beginPath(); b.arc(cx - s * 0.35, cy - s * 0.38, s * 0.32, 0, 7); b.fill();
      } else {
        b.fillStyle = 'rgba(0,0,0,.2)'; b.beginPath(); b.ellipse(cx + 2, cy + 3, s * 0.8, s * 0.55, 0, 0, 7); b.fill();
        b.fillStyle = '#8b877c'; b.beginPath(); b.ellipse(cx, cy, s * 0.75, s * 0.55, it.v, 0, 7); b.fill();
        b.fillStyle = '#a9a598'; b.beginPath(); b.ellipse(cx - s * 0.15, cy - s * 0.15, s * 0.4, s * 0.28, it.v, 0, 7); b.fill();
      }
    }
    b.restore();
  }

  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }

  // ---------- Voies ----------
  function poly(c, pts) { c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(X(p[0]), Y(p[1])) : c.moveTo(X(p[0]), Y(p[1]))); }
  function stroke(c, pts, color = COL.track, width = 0.2, alpha = 1) {
    c.globalAlpha = alpha; c.lineCap = 'round'; c.lineJoin = 'round'; c.lineWidth = cell * width; c.strokeStyle = color;
    poly(c, pts); c.stroke(); c.globalAlpha = 1;
  }
  function offset(pts, o) {
    return pts.map((p, i) => {
      const a = pts[Math.max(0, i - 1)], q = pts[Math.min(pts.length - 1, i + 1)];
      const dx = q[0] - a[0], dy = q[1] - a[1], l = Math.hypot(dx, dy) || 1;
      return [p[0] - dy / l * o, p[1] + dx / l * o];
    });
  }
  // voie réaliste : ballast, traverses, deux rails ; list = tableaux de points (en cases)
  function track(c, list, alpha = 1) {
    c.save(); c.globalAlpha = alpha; c.lineCap = 'round'; c.lineJoin = 'round';
    c.strokeStyle = COL.ballastDark; c.lineWidth = cell * 0.4; for (const p of list) { poly(c, p); c.stroke(); }
    c.strokeStyle = COL.ballast; c.lineWidth = cell * 0.33; for (const p of list) { poly(c, p); c.stroke(); }
    c.strokeStyle = COL.sleeper; c.lineWidth = cell * 0.07; c.lineCap = 'butt';
    for (const pts of list) {
      let acc = 0.08;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], q = pts[i], l = Math.hypot(q[0] - a[0], q[1] - a[1]); if (!l) continue;
        const nx = -(q[1] - a[1]) / l, ny = (q[0] - a[0]) / l;
        for (; acc < l; acc += 0.19) {
          const t = acc / l, xx = a[0] + (q[0] - a[0]) * t, yy = a[1] + (q[1] - a[1]) * t;
          c.beginPath(); c.moveTo(X(xx - nx * 0.17), Y(yy - ny * 0.17)); c.lineTo(X(xx + nx * 0.17), Y(yy + ny * 0.17)); c.stroke();
        }
        acc -= l;
      }
    }
    c.lineCap = 'round';
    for (const pts of list) for (const o of [-0.095, 0.095]) {
      const p = offset(pts, o);
      c.strokeStyle = COL.railDark; c.lineWidth = cell * 0.07; poly(c, p); c.stroke();
      c.strokeStyle = COL.rail; c.lineWidth = cell * 0.035; poly(c, p); c.stroke();
    }
    c.restore();
  }
  const partial = (s, k) => k >= 1 ? s.pts : s.pts.slice(0, Math.max(2, Math.ceil(k * (s.pts.length - 1)) + 1));
  // réseau (hors aiguillages si skipSwitches) jusqu'au front de construction f
  function drawNetwork(c, f, skipSwitches) {
    const m = mouth(), d = board.entry.inDir;
    const list = [[[m[0] - DC[d] * 0.6, m[1] - DR[d] * 0.6], m]];
    for (const n of board.nodes) {
      if (n.vis === false) continue;
      const sw = n.outs.length === 2;
      if (skipSwitches && sw && !n.fixed) continue;
      const ff = n.grow && S && S.gf != null ? Math.min(f, S.gf) : f;
      for (const s of (sw && n.fixed ? [n.segs[n.state]] : n.segs)) { const k = clamp((ff - n.din) / s.len, 0, 1); if (k > 0) list.push(partial(s, k)); }
    }
    track(c, list);
  }

  // ---------- Symboles ----------
  function symbol(c, kind, x, y, s, fg, bgc) {
    c.fillStyle = fg; c.strokeStyle = fg; c.beginPath();
    const P = (n, rot, rad = s) => { for (let i = 0; i < n; i++) { const a = rot + i * 2 * Math.PI / n; i ? c.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad) : c.moveTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad); } c.closePath(); c.fill(); };
    switch (kind) {
      case 'circle': c.arc(x, y, s * 0.85, 0, 7); c.fill(); break;
      case 'square': c.rect(x - s * 0.75, y - s * 0.75, s * 1.5, s * 1.5); c.fill(); break;
      case 'triangle': P(3, -Math.PI / 2, s * 1.05); break;
      case 'diamond': P(4, -Math.PI / 2, s * 1.0); break;
      case 'pentagon': P(5, -Math.PI / 2, s * 0.95); break;
      case 'hexagon': P(6, 0, s * 0.92); break;
      case 'star': for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? s * 0.45 : s * 1.05; i ? c.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad) : c.moveTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad); } c.closePath(); c.fill(); break;
      case 'plus': c.rect(x - s * 0.28, y - s * 0.9, s * 0.56, s * 1.8); c.rect(x - s * 0.9, y - s * 0.28, s * 1.8, s * 0.56); c.fill(); break;
      case 'cross': c.save(); c.translate(x, y); c.rotate(Math.PI / 4); c.rect(-s * 0.27, -s, s * 0.54, s * 2); c.rect(-s, -s * 0.27, s * 2, s * 0.54); c.fill(); c.restore(); break;
      case 'ring': c.lineWidth = s * 0.42; c.arc(x, y, s * 0.68, 0, 7); c.stroke(); break;
      case 'heart': c.moveTo(x, y + s * 0.85); c.bezierCurveTo(x - s * 1.25, y - s * 0.05, x - s * 0.6, y - s * 1.05, x, y - s * 0.4); c.bezierCurveTo(x + s * 0.6, y - s * 1.05, x + s * 1.25, y - s * 0.05, x, y + s * 0.85); c.fill(); break;
      case 'crescent': c.arc(x, y, s * 0.9, 0, 7); c.fill(); c.fillStyle = bgc; c.beginPath(); c.arc(x + s * 0.42, y - s * 0.22, s * 0.72, 0, 7); c.fill(); break;
    }
  }

  // ---------- Partie ----------
  // sur un aiguillage, la voie du train suit la position de l'aiguillage jusqu'au centre de la case, puis elle est figée pour
  // ce train ; l'aiguillage, lui, reste libre (v15.1) : un tap prépare déjà la voie du train suivant
  function enter(tr, n) {
    tr.node = n; tr.oi = n.outs.length === 2 ? n.state : 0; tr.seg = n.segs[tr.oi];
    tr.committed = n.outs.length !== 2 || !!n.fixed; tr.blend = 0;
  }
  function follow(tr) {
    const n = tr.node;
    if (tr.committed) return;
    if (S.demo && !n.locked) { const need = tr.route.sws.find(x => x.sw === n); if (need && n.state !== need.state && tr.t > 0.15) { n.state = need.state; n.pulse = 1; } }
    if (tr.oi !== n.state) { tr.prevSeg = tr.seg; tr.blend = 1; tr.oi = n.state; tr.seg = n.segs[tr.oi]; }
    if (tr.t >= COMMIT) {
      tr.committed = true;
      const need = tr.route.sws.find(x => x.sw === n), good = !!need && need.state === tr.oi;
      if (!good) tr.onPlan = false;
      if (tr.id != null && tr.onPlanLogged !== false) S.log.trains[tr.id].c.push([board.switches.indexOf(n), +S.el.toFixed(2), good ? 1 : 0]);
      if (!good) tr.onPlanLogged = false;
    }
  }
  // ---------- Départs (v15) : compte-gouttes à la cadence du point ; à chaque départ, ordonnancement ----------
  // grappes (v15.1) : au plus mp trains d'affilée à moins de 60 % de l'écart moyen, puis une pause d'au moins l'écart moyen
  function ecartMini() { const p = cur(), moy = 60 / p.tpm; if (S.run >= p.mp - 1) return S.run > 0 ? moy : 0.6 * moy; return 1 / board.p.v; }
  function startDropper() { const p = cur(), gap = 60 / p.tpm; S.dropper = AIG.makeDropper({ gap0: gap, gap1: gap, regular: 0.6, maxPending: p.mp }, Math.random, 1e9); S.dropper.tick(0, 1e-3); }
  // fenêtres de basculement des trains en route, plus celles d'un train qui partirait maintenant vers st (null : fenêtre trop courte)
  function fenetres(st) {
    const v = board.p.v, now = S.el, lock = ORD.verrou / v, req = new Map();
    const add = (sw, q) => { if (!req.has(sw)) req.set(sw, []); req.get(sw).push(q); };
    for (const tr of S.trains) if (tr.onPlan && tr.route) for (const x of tr.route.sws) if (x.din + COMMIT > tr.s + 1e-9) add(x.sw, { t: now + (x.din + COMMIT - tr.s) / v, state: x.state, born: tr.born });
    if (st) for (const x of board.routes.get(st).sws) add(x.sw, { t: now + (x.din + COMMIT) / v, state: x.state, born: now, cand: true });
    const taches = []; let nouv = 0, serre = 0;
    for (const [sw, l] of req) {
      l.sort((a, b) => a.t - b.t);
      let etat = sw.state, libre = now;
      if (sw.locked) { const tr = S.trains.find(t => t.node === sw && t.committed); if (tr) libre = now + (1 - tr.t) * tr.seg.len / v; }
      for (const q of l) {
        if (q.state !== etat) {
          const open = Math.max(libre, q.born + ORD.tId), close = q.t;
          if (close - open < ORD.tMin - 1e-9) { if (q.cand) return null; }   // fenêtre déjà trop courte : le joueur est en retard
          else { taches.push({ open, close }); if (q.cand) { nouv++; if (close - open < 2) serre++; } }
          etat = q.state;
        }
        libre = q.t + lock;
      }
    }
    return { taches, nouv, serre };
  }
  // un départ : parmi les w prochaines gares de la pioche, celle qui demande le plus de travail tout en restant jouable
  function depart() {
    if (!S.bag.length) { S.bag = shuffle(board.stations.filter(s => s.vis !== false)); if (S.bag[S.bag.length - 1] === S.lastSt) S.bag.unshift(S.bag.pop()); }
    const p = cur(), cand = S.bag.slice(-p.w), baseOk = AIG.planifier(fenetres(null).taches, S.el, ORD.tTap);
    let best = null, bw = -1;
    for (const st of cand) {
      const f = fenetres(st); if (!f) continue;
      if (baseOk ? !AIG.planifier(f.taches, S.el, ORD.tTap) : f.nouv > 0) continue;   // joueur en retard : seulement un train sans basculement
      const w = f.nouv + p.cw * f.serre;
      if (w > bw || (w === bw && Math.random() < 0.5)) { bw = w; best = st; }
    }
    if (!best) return false;
    S.bag.splice(S.bag.indexOf(best), 1); S.lastSt = best;
    const tr = { t: 0, s: 0, dest: best.st, route: board.routes.get(best), onPlan: true, id: S.log.trains.length, born: S.el };
    S.log.trains.push({ t: +S.el.toFixed(2), g: best.st, w: bw, k: pointNow(), c: [] });
    S.run = S.el - S.lastDep < 0.6 * 60 / p.tpm ? S.run + 1 : 0;
    enter(tr, board.entry); S.trains.push(tr); S.lastDep = S.el;
    return true;
  }

  function update(dt) {
    if (mode === 'build') { S.pt += dt; if (S.pt >= BUILD) { mode = 'observe'; S.pt = 0; buildBg(); } return; }
    if (mode === 'grow') {
      S.pt += dt; S.wf = S.g1 * chantier(clamp(S.pt / (S.growDur * 0.85), 0, 1)); S.gf = Math.max(S.g0, S.wf);   // les ouvriers partent du tunnel ; la voie neuve pousse derrière eux
      if (S.pt >= S.growDur) { board.nodes.forEach(n => { n.grow = false; }); S.gf = null; buildBg(); mode = 'observe'; S.pt = 0; S.obs = obsDur(S.palier); }
      return;
    }
    if (mode === 'observe') { S.pt += dt; if (S.pt >= S.obs) { mode = 'playing'; startDropper(); S.tryT = 0; } return; }
    if (mode === 'demo') { demoUpdate(dt); return; }
    if (mode === 'ending') { S.endT -= dt; if (S.endT <= 0) showOver(); return; }
    if (mode !== 'playing') return;
    S.clock += dt; S.el += dt;
    if (!S.closing && !S.hold) {
      S.dropper.tick(S.el, dt);
      const quota = gm === 'niveaux' ? nTrains(level) : gm === 'balayage' ? BAL_N : Infinity;
      if (S.ptSpawned < quota && S.dropper.pending > 0 && S.el - S.lastDep >= ecartMini()) {
        S.tryT -= dt;
        if (S.tryT <= 0) { if (depart()) { S.dropper.take(); S.ptSpawned++; } else S.tryT = 0.1; }
      }
      if (S.ptSpawned >= quota) { if (gm === 'niveaux') S.closing = true; else S.hold = 'point'; }
    }
    // Balayage : point terminé quand ses trains sont arrivés ; point suivant sur un nouveau réseau
    if (S.hold === 'point' && !S.trains.length) {
      const r = { k: S.point, ok: S.pOk, ko: S.pKo, t: +S.el.toFixed(2) };
      S.pts.push(r); S.log.points.push(r);
      if (S.point >= 20) { S.hold = 'fin'; mode = 'ending'; S.endT = 1.2; return; }
      S.point++; S.pOk = S.pKo = 0; S.ptSpawned = 0; S.hold = false; S.bag = []; S.lastSt = null;
      board = buildBoard(S.point); board.p.v = cur().v; bg = null; layout(); mode = 'build'; S.pt = 0; lastHud = ''; hud(); return;
    }
    // Terminus : quand plus aucun train ne roule, le réseau s'agrandit (nouvelles gares)
    if (S.hold === 'reveal' && !S.trains.length) {
      const { fresh, opened } = revealTo(board, ptOf(S.palier).g);
      fresh.forEach(n => { n.grow = true; });
      opened.forEach(sw => { sw.grow = true; sw.newI = [0, 1].find(i => fresh.includes(board.grid[(sw.r + DR[sw.outs[i]]) * board.cols + sw.c + DC[sw.outs[i]]])); sw.pulse = 1; });
      const ds = fresh.map(n => n.din).concat(opened.map(n => n.din));
      S.g0 = Math.min(...ds); S.g1 = Math.max(...fresh.filter(n => !n.outs.length).map(n => n.din + 1.5), S.g0 + 1);
      S.gf = S.g0; S.wf = 0; S.hold = false; S.bag = []; S.lastSt = null; board.p.v = cur().v;
      S.log.reveals.push({ palier: S.palier, t: +S.el.toFixed(2), gares: ptOf(S.palier).g });
      bg = null; mode = 'grow'; S.pt = 0; S.growDur = growDur(S.palier); hud(); return;
    }
    const v = board.p.v;
    for (const tr of S.trains) {
      const step = v * dt;
      tr.s += step; tr.t += step / tr.seg.len;
      tr.blend = Math.max(0, tr.blend - dt / 0.15);
      follow(tr);
      while (tr.t >= 1 && !tr.done) {
        const over = (tr.t - 1) * tr.seg.len;
        if (!tr.node.outs.length) { arrive(tr); break; }
        const d = tr.node.outs[tr.oi];
        enter(tr, board.grid[(tr.node.r + DR[d]) * board.cols + tr.node.c + DC[d]]);
        tr.t = over / tr.seg.len;
        follow(tr);
      }
    }
    S.trains = S.trains.filter(t => !t.done);
    for (const s of board.switches) s.engaged = -1;   // v15.1 : plus de verrou ; on garde la voie du train engagé pour l'afficher
    for (const tr of S.trains) if (tr.node.outs.length === 2 && tr.committed) tr.node.engaged = tr.oi;
    if (S.closing && !S.trains.length) { mode = 'ending'; S.endT = 1.2; }
    hud();
  }
  function moveTrains(dt) {
    for (const tr of S.trains) {
      tr.s += dt; tr.t += dt / tr.seg.len;
      follow(tr);
      while (tr.t >= 1 && !tr.done) {
        const over = (tr.t - 1) * tr.seg.len;
        if (!tr.node.outs.length) { arrive(tr); break; }
        const d = tr.node.outs[tr.oi];
        enter(tr, board.grid[(tr.node.r + DR[d]) * board.cols + tr.node.c + DC[d]]);
        tr.t = over / tr.seg.len;
        follow(tr);
      }
    }
    S.trains = S.trains.filter(t => !t.done);
    for (const s of board.switches) s.engaged = -1;   // v15.1 : plus de verrou ; on garde la voie du train engagé pour l'afficher
    for (const tr of S.trains) if (tr.node.outs.length === 2 && tr.committed) tr.node.engaged = tr.oi;
  }
  // ---------- Fond animé de l'accueil : petit réseau du niveau 3 qui tourne seul ----------
  function startDemo() {
    if (mode === 'demo' && S && S.demo) return;
    gm = 'niveaux';
    board = buildBoard(3);
    S = { demo: true, pt: 0, clock: 0, el: 0, trains: [], bag: [], palier: 1, pk: 0, score: 0, serie: 0, bestSerie: 0, ok: 0, ko: 0, particles: [], popups: [], next: 0.5 };
    bg = null; mode = 'demo'; layout(); lastHud = ''; hud();
  }
  function demoUpdate(dt) {
    S.el += dt; S.next -= dt;
    const last = S.trains[S.trains.length - 1];
    if (S.next <= 0 && (!last || last.s > 2.6)) {
      const st = board.stations[rint(0, board.stations.length - 1)];
      const tr = { t: 0, s: 0, dest: st.st, route: board.routes.get(st), onPlan: true };
      enter(tr, board.entry); S.trains.push(tr); S.next = rnd(2.8, 4.2);
    }
    moveTrains(dt);
  }

  function arrive(tr) {
    tr.done = true;
    if (tr.id != null) { const e = S.log.trains[tr.id]; e.a = +S.el.toFixed(2); e.ok = tr.node.st === tr.dest ? 1 : 0; }
    const st = tr.node, x = X(st.c + 0.5), y = Y(st.r + 0.5);
    if (S.demo) { if (st.st === tr.dest) st.pulse = 1; return; }
    if (st.st === tr.dest) {
      const d = cur(); let pts = d.b + (S.serie >= d.S ? d.Bq + (S.bonusK++ < d.Br ? 1 : 0) : 0);   // b, puis le bonus de série
      if (gm === 'survie' && S.pk >= MS_STEP) pts = 0;   // Terminus : 6 trains payés par palier (trains arrivés pendant l'attente du nouveau réseau)
      if (gm === 'balayage') S.pOk++;
      if (gm === 'survie') S.pk++;
      if (gm === 'survie' && !S.hold && S.pk >= MS_STEP) {
        const prev = S.palier, skip = S.clean && prev + 2 <= MS_SKIP_TO;
        const gain = (S.clean ? 0.4 * palierVal(prev) : 0) + (skip ? palierVal(prev + 1) : 0);   // palier sans raté, palier sauté
        if (gain) { S.score += gain; opts.signaler('bonus', { points: gain }); S.popups.push({ x: W / 2, y: H * 0.28, text: '+' + fmt(gain) + (skip ? ' · palier sauté' : ' · sans raté'), life: 1.6, col: '#9be564' }); }
        S.palier = prev + (skip ? 2 : 1); S.pk = 0; S.clean = true;
        S.log.paliers.push({ palier: S.palier, t: +S.el.toFixed(2) });
        opts.signaler('niveau', { niveau: S.palier });
        if (S.palier >= 10 && S.t10 == null) S.t10 = S.el;
        const ng = ptOf(S.palier).g - ptOf(prev).g;
        if (ng > 0) {
          // nouvelles gares : plus de départs ; le réseau s'agrandit quand les trains en route sont arrivés
          S.hold = 'reveal';
          S.popups.push({ x: W / 2, y: H * 0.18, text: 'Palier ' + S.palier + (skip ? ' · sans faute !' : ng > 1 ? ' · ' + ng + ' nouvelles gares' : ' · nouvelle gare'), life: 2, col: '#ffb703' });
        } else {
          // même réseau : nouveau rythme tout de suite (pas de pause)
          board.p.v = cur().v; startDropper();
          S.popups.push({ x: W / 2, y: H * 0.18, text: 'Palier ' + S.palier + (S.palier > 10 ? ' · plus de trains' : ''), life: 1.4, col: '#ffb703' });
        }
      }
      S.score += pts; S.serie++; S.ok++; S.bestSerie = Math.max(S.bestSerie, S.serie);
      opts.signaler('reussite', { points: pts, niveau: pointNow() });
      st.pulse = 1;
      if (pts) S.popups.push({ x, y: y - cell * 0.45, text: '+' + pts, life: 1, col: '#ffe08a' });
      const col = STATIONS[st.st].col;
      for (let i = 0; i < 14; i++) { const a = rnd(0, 6.28), sp = rnd(60, 170); S.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, life: rnd(.5, .8), col: i % 3 ? col : '#fff4e0', r: rnd(2, 4) }); }
    } else {
      S.serie = 0; S.ko++; if (gm === 'balayage') S.pKo++;
      opts.signaler('erreur');
      st.bad = 1; st.shake = 1;
      if (gm === 'survie' && !S.hold) S.clean = false;
      if (gm === 'survie') opts.signaler('vie');
      if (gm === 'survie' && --S.lives <= 0) { mode = 'ending'; S.endT = 1.4; S.dead = true; }
      S.popups.push({ x, y: y - cell * 0.45, text: '✕', life: 1, col: '#ff5a5f' });
      for (let i = 0; i < 10; i++) S.particles.push({ x: x + rnd(-8, 8), y, vx: rnd(-30, 30), vy: rnd(-90, -40), life: rnd(.6, 1), col: 'rgba(90,90,90,.7)', r: rnd(4, 7), smoke: true });
    }
  }

  // ---------- Saisie ----------
  const surToucher = ev => {
    if (mode !== 'playing' && mode !== 'observe') return;
    ev.preventDefault();
    const r = cv.getBoundingClientRect();
    const gx = (ev.clientX - r.left - ox) / cell, gy = (ev.clientY - r.top - oy) / cell;
    let best = null, bd = 0.8;
    for (const s of board.switches) { if (s.fixed || s.vis === false) continue; const d = Math.hypot(s.c + 0.5 - gx, s.r + 0.5 - gy); if (d < bd) { bd = d; best = s; } }
    if (!best) return;
    if (S && S.log && mode === 'playing') S.log.taps.push([+S.el.toFixed(2), board.switches.indexOf(best), best.locked ? 1 : 0]);
    if (best.locked) { best.deny = 1; return; }
    best.state ^= 1; best.pulse = 1;
  };
  cv.addEventListener('pointerdown', surToucher);;

  // ---------- Dessin ----------
  function draw(dt) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (!board || !S) return;
    const building = mode === 'build' || mode === 'grow' || (mode === 'paused' && (S.prevMode === 'build' || S.prevMode === 'grow'));
    const growing = mode === 'grow' || (mode === 'paused' && S.prevMode === 'grow');
    const f = building && !growing ? board.maxD * chantier(clamp(S.pt / (BUILD * 0.85), 0, 1)) + 0.01 : Infinity;

    if (building || !bg) { drawGround(ctx); drawNetwork(ctx, f, true); } else { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(bg, 0, 0); ctx.restore(); }

    // aiguillages : voies réalistes, puis plaque ronde où la voie ouverte est allumée
    const swl = [];
    const gf = S.gf != null ? S.gf : Infinity;
    for (const sw of board.switches) {
      if (sw.vis === false || sw.fixed) continue;
      sw.segs.forEach((sg, i) => { const ff = sw.grow && i === sw.newI ? Math.min(f, gf) : f; const k = clamp((ff - sw.din) / sg.len, 0, 1); if (k > 0) swl.push(partial(sg, k)); });
    }
    if (swl.length) track(ctx, swl);
    for (const sw of board.switches) {
      if (sw.vis === false || sw.fixed) continue;
      const pop = clamp(((sw.grow ? Math.min(f, gf) : f) - sw.din - 0.5) / 0.9, 0, 1);
      if (pop <= 0) continue;
      sw.pulse = Math.max(0, sw.pulse - dt * 4); sw.deny = Math.max(0, sw.deny - dt * 3);
      const x = X(sw.c + 0.5), y = Y(sw.r + 0.5), R = cell * (0.4 + 0.04 * sw.pulse) * easeBack(pop);
      ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.arc(x + cell * 0.03, y + cell * 0.05, R + cell * 0.03, 0, 7); ctx.fill();
      ctx.fillStyle = sw.locked ? '#8a918c' : (sw.deny ? '#d06a62' : COL.ring); ctx.beginPath(); ctx.arc(x, y, R + cell * 0.035, 0, 7); ctx.fill();
      ctx.fillStyle = sw.locked ? COL.discLocked : COL.disc; ctx.beginPath(); ctx.arc(x, y, R, 0, 7); ctx.fill();
      ctx.save(); ctx.beginPath(); ctx.arc(x, y, Math.max(0, R), 0, 7); ctx.clip();
      stroke(ctx, sw.segs[sw.state ^ 1].pts, '#56635a', 0.14, 0.8);
      if (sw.engaged >= 0 && sw.engaged !== sw.state) stroke(ctx, sw.segs[sw.engaged].pts, COL.openLocked, 0.18);   // voie du train engagé
      stroke(ctx, sw.segs[sw.state].pts, sw.locked ? COL.openLocked : COL.open, 0.22);
      ctx.restore();
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; ctx.fillStyle = '#6d7870'; ctx.beginPath(); ctx.arc(x + Math.cos(a) * (R + cell * 0.018), y + Math.sin(a) * (R + cell * 0.018), cell * 0.018, 0, 7); ctx.fill(); }
    }

    for (const tr of S.trains) drawTrain(tr);

    for (const st of board.stations) {
      if (st.vis === false) continue;
      const pop = clamp(((st.grow ? Math.min(f, gf) : f) - st.din - 0.5) / 0.9, 0, 1);
      if (pop <= 0) continue;
      st.pulse = Math.max(0, st.pulse - dt * 2.5); st.bad = Math.max(0, st.bad - dt * 1.5);
      st.shake = Math.max(0, (st.shake || 0) - dt / 0.35);
      const info = STATIONS[st.st], x = X(st.c + 0.5) + Math.sin(performance.now() / 22) * cell * 0.06 * st.shake, y = Y(st.r + 0.5);
      const s = cell * 0.78 * (1 + 0.12 * Math.sin(st.pulse * Math.PI)) * easeBack(pop);
      G3.dessine(ctx, 'uauvent', 'autocollant', x, y, s, info.col, st.inDir, st.bad);
      if (st.pulse > 0) { const g = 6 * (1 - st.pulse) + 3; ctx.strokeStyle = `rgba(255,236,170,${st.pulse})`; ctx.lineWidth = 3; rr(ctx, x - s / 2 - g, y - s / 2 - g, s + 2 * g, s + 2 * g, s * 0.3); ctx.stroke(); }
    }

    if (building) drawOuvriers(growing ? (S.wf ?? 0) : f, dt, growing);
    drawTunnel();
    drawSignal();

    for (const p of S.particles) {
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.smoke ? -20 : 260) * dt;
      ctx.globalAlpha = clamp(p.life * 1.6, 0, 1); ctx.fillStyle = p.col;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.smoke ? p.r * (1.6 - p.life) : p.r, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
    S.particles = S.particles.filter(p => p.life > 0);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const p of S.popups) {
      p.life -= dt * 0.9; p.y -= dt * 34;
      ctx.globalAlpha = clamp(p.life * 1.5, 0, 1);
      ctx.font = `700 ${Math.round(cell * 0.42)}px Fredoka, sans-serif`;
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(30,20,10,.7)'; ctx.strokeText(p.text, p.x, p.y);
      ctx.fillStyle = p.col; ctx.fillText(p.text, p.x, p.y);
    }
    ctx.globalAlpha = 1;
    S.popups = S.popups.filter(p => p.life > 0);
    if (mode === 'ending') banner(S.dead ? 'Terminus !' : gm === 'balayage' ? 'Balayage terminé' : 'Tous les trains sont passés');
  }

  // tunnel orienté vers l'intérieur du plateau
  // tunnel de montagne vu strictement de dessus, lumière fixe venant du haut-gauche de l'écran :
  // le dessin reste cohérent quel que soit le bord du tunnel
  // ---------- Tunnel : portail de pierre ----------
  const TUNNEL = { W: 1.8, D: 0.84 };   // largeur et profondeur en cases
  // étendue du tunnel de part et d'autre de la voie (en cases, à l'écran) : l'ouverture reste toujours sur les rails,
  // c'est le talus qui s'allonge du côté libre quand le tunnel est dans une colonne du bord
  function geoTunnel() {
    const m = mouth(), W = TUNNEL.W;
    const gauche = m[0] + 0.05, droite = board.cols - m[0] + 0.05;   // place dans le plateau
    let L = Math.min(gauche, W / 2), R = Math.min(droite, W / 2);
    const manque = W - L - R; if (manque > 0) { if (gauche > L) L = Math.min(gauche, L + manque); else R = Math.min(droite, R + manque); }
    const side = droite - R >= gauche - L ? 1 : -1;
    return { L, R, side, hw: (L + R) / 2, sdx: (R - L) / 2 };
  }
  function repereLarge(fn) {
    const m = mouth(), d = board.entry.inDir, u = cell, ang = Math.atan2(DR[d], DC[d]) - Math.PI / 2, g = geoTunnel(), inv = Math.cos(ang) < 0;
    const gl = (inv ? g.R : g.L) * u, dr = (inv ? g.L : g.R) * u;   // étendues dans le repère local
    ctx.save(); ctx.translate(X(m[0]), Y(m[1])); ctx.rotate(ang); fn(u, (gl + dr) / 2, TUNNEL.D * u, (dr - gl) / 2, gl, dr); ctx.restore();
  }
  // ombre qui entre dans le tunnel (sur la voie, côté plateau)
  function bouche(u, a = 0.55) { const sh = ctx.createLinearGradient(0, 0, 0, u * 0.3); sh.addColorStop(0, `rgba(0,0,0,${a})`); sh.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = sh; ctx.fillRect(-u * 0.3, 0, u * 0.6, u * 0.3); }
  function drawTunnel() {
    repereLarge((u, hw, D, dx, gl, dr) => {
      ctx.save();
      // talus herbu de -gl à +dr (asymétrique au bord du plateau), l'ouvrage reste centré sur la voie
      const a = -gl, b = dr;
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.moveTo(a + 4, 4); ctx.lineTo(a * 0.98 + 4, -D + 4); ctx.lineTo(b * 0.98 + 4, -D + 4); ctx.lineTo(b + 4, 4); ctx.fill();
      const g = ctx.createLinearGradient(0, -D, 0, 0); g.addColorStop(0, '#6d9157'); g.addColorStop(1, '#55783f');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(a, 0); ctx.quadraticCurveTo(a * 1.02, -D * 0.6, a + u * 0.09, -D); ctx.lineTo(b - u * 0.09, -D); ctx.quadraticCurveTo(b * 1.02, -D * 0.6, b, 0); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.1)'; ctx.beginPath(); ctx.ellipse((a + b) / 2 - u * 0.2, -D * 0.68, (b - a) * 0.25, D * 0.16, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#3f6a35'; [[0.08, -0.7, 0.11], [0.2, -0.82, 0.08], [0.85, -0.6, 0.12], [0.92, -0.8, 0.08], [0.7, -0.85, 0.07]].forEach(([k, c, r]) => { ctx.beginPath(); ctx.arc(a + k * (b - a), c * D, r * u, 0, 7); ctx.fill(); });
      // murs en aile (jusqu'au bord du talus, au plus 0,35 case) + mur de tête
      const wl = Math.min(gl - u * 0.04, u * 0.9), wr = Math.min(dr - u * 0.04, u * 0.9);
      ctx.fillStyle = '#9b917e'; ctx.beginPath(); ctx.moveTo(-u * 0.55, 0); ctx.lineTo(-wl, 0); ctx.lineTo(-wl, -u * 0.08); ctx.lineTo(-u * 0.55, -u * 0.3); ctx.fill();
      ctx.beginPath(); ctx.moveTo(u * 0.55, 0); ctx.lineTo(wr, 0); ctx.lineTo(wr, -u * 0.08); ctx.lineTo(u * 0.55, -u * 0.3); ctx.fill();
      ctx.fillStyle = '#b3a993'; ctx.fillRect(-u * 0.55, -u * 0.3, u * 1.1, u * 0.3);
      ctx.strokeStyle = 'rgba(70,60,48,.55)'; ctx.lineWidth = 1;
      for (let j = 0; j < 3; j++) { const yy = -u * 0.3 + j * u * 0.1; ctx.beginPath(); ctx.moveTo(-u * 0.55, yy); ctx.lineTo(u * 0.55, yy); ctx.stroke();
        for (let i = 0; i < 9; i++) { const xx = -u * 0.55 + (i + (j % 2) * 0.5) * u * 0.122; ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx, yy + u * 0.1); ctx.stroke(); } }
      ctx.fillStyle = '#d2c8b2'; ctx.fillRect(-u * 0.6, -u * 0.34, u * 1.2, u * 0.05);   // corniche
      // ouverture voûtée et voussoirs
      ctx.fillStyle = '#17120d'; ctx.beginPath(); ctx.moveTo(-u * 0.3, 0); ctx.lineTo(-u * 0.3, -u * 0.08); ctx.quadraticCurveTo(0, -u * 0.3, u * 0.3, -u * 0.08); ctx.lineTo(u * 0.3, 0); ctx.fill();
      ctx.strokeStyle = '#d8ceb8'; ctx.lineWidth = u * 0.045; ctx.beginPath(); ctx.moveTo(-u * 0.33, -u * 0.08); ctx.quadraticCurveTo(0, -u * 0.34, u * 0.33, -u * 0.08); ctx.stroke();
      ctx.fillStyle = '#e6dcc4'; ctx.fillRect(-u * 0.05, -u * 0.25, u * 0.1, u * 0.07);
      ctx.restore(); bouche(u, 0.55);
    });
  }

  // ---------- Gares (v15.5) : gare en U à auvents, style autocollant, 4 orientations : la façade d'entrée des voies regarde toujours le train qui arrive ----------
  // modèle en cases : x à droite, y vers le fond, z vers le haut ; entrée des voies du côté y < 0 ; projection oblique fixe
  const G3 = (() => {
    const A = 0, B = 0.72, Cz = 0.62, CAM = [A, -1, B / Cz], LUM = (() => { const v = [-0.45, -0.55, 0.7], n = Math.hypot(...v); return v.map(x => x / n); })();
    const sub = (p, q) => [p[0] - q[0], p[1] - q[1], p[2] - q[2]], cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
    // solides : listes de faces (polygones 3D, sens quelconque), décors attachés à une face en coordonnées (u, v) ∈ [0, 1]²
    function boite(x0, x1, y0, y1, z0, z1, deco = {}) {
      const P = (x, y, z) => [x, y, z];
      return [
        { p: [P(x0, y0, z0), P(x1, y0, z0), P(x1, y0, z1), P(x0, y0, z1)], n: [0, -1, 0], d: deco.av, t: 'mur' },
        { p: [P(x1, y1, z0), P(x0, y1, z0), P(x0, y1, z1), P(x1, y1, z1)], n: [0, 1, 0], d: deco.ar, t: 'mur' },
        { p: [P(x0, y1, z0), P(x0, y0, z0), P(x0, y0, z1), P(x0, y1, z1)], n: [-1, 0, 0], d: deco.g, t: 'mur' },
        { p: [P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1)], n: [1, 0, 0], d: deco.d, t: 'mur' },
        { p: [P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], n: [0, 0, 1], t: 'toit' },
      ];
    }
    // toit à deux pans posé sur (x0..x1, y0..y1) à la hauteur z, faîtage à zf, le long de l'axe 'x' ou 'y' ; pignons décorables
    function toit2(x0, x1, y0, y1, z, zf, axe, deco = {}) {
      const nrm = (a, b, c) => { const n = cross(sub(b, a), sub(c, a)), l = Math.hypot(...n); return n.map(v => v / l); };
      const F = [];
      if (axe === 'y') {
        const xm = (x0 + x1) / 2, a = [x0, y0, z], b = [xm, y0, zf], c = [x1, y0, z], a2 = [x0, y1, z], b2 = [xm, y1, zf], c2 = [x1, y1, z];
        F.push({ p: [a, b, b2, a2], t: 'toit' }, { p: [b, c, c2, b2], t: 'toit' }, { p: [a, c, b], n: [0, -1, 0], t: 'pignon', d: deco.av }, { p: [c2, a2, b2], n: [0, 1, 0], t: 'pignon', d: deco.ar });
      } else {
        const ym = (y0 + y1) / 2, a = [x0, y0, z], b = [x0, ym, zf], c = [x0, y1, z], a2 = [x1, y0, z], b2 = [x1, ym, zf], c2 = [x1, y1, z];
        F.push({ p: [a, a2, b2, b], t: 'toit' }, { p: [b, b2, c2, c], t: 'toit' }, { p: [c, a, b], n: [-1, 0, 0], t: 'pignon', d: deco.g }, { p: [a2, c2, b2], n: [1, 0, 0], t: 'pignon', d: deco.d });
      }
      for (const f of F) if (!f.n) { const n = nrm(...f.p); f.n = n[2] < 0 ? n.map(v => -v) : n; }
      return F;
    }
    // décors : [forme, u0, v0, u1, v1] ; formes : 'f' fenêtre, 'p' porte, 'a' arche des voies, 'h' horloge
    const fen = (u, v, w = 0.12, h = 0.3) => ['f', u - w / 2, v, u + w / 2, v + h];
    const MODELES = {
      // gare en U à auvents : bâtiment au fond (à l'opposé de la voie qui arrive), deux quais couverts de part et d'autre
      uauvent: () => [
        { f: boite(-0.42, 0.42, 0.1, 0.42, 0, 0.24, { av: [['a', 0.4, 0, 0.6, 0.75]] }).concat(toit2(-0.44, 0.44, 0.08, 0.44, 0.24, 0.4, 'x')) },
        { f: boite(-0.42, -0.15, -0.24, 0.1, 0, 0.06) }, { f: boite(0.15, 0.42, -0.24, 0.1, 0, 0.06) },
        { f: boite(-0.44, -0.17, -0.2, 0.1, 0.17, 0.2) }, { f: boite(0.17, 0.44, -0.2, 0.1, 0.17, 0.2) },   // auvents des quais
        { f: boite(-0.3, -0.27, -0.18, -0.15, 0.06, 0.17).concat(boite(0.27, 0.3, -0.18, -0.15, 0.06, 0.17)).map(f => (f.t = 'poteau', f)) },
      ],
    };
    const VOIES = { uauvent: [[0, -0.5, 0.06]] };   // heurtoir au bout de la voie
    function rot(p, k) { let [x, y, z] = p; for (let i = 0; i < k; i++) [x, y] = [-y, x]; return [x, y, z]; }
    const cache = new Map();
    // style : 'autocollant' | 'ligne' | 'maquette' | 'pixel'
    function image(modele, style, col, k, U) {
      const key = [modele, style, col, k, Math.round(U)].join('|'); if (cache.has(key)) return cache.get(key);
      const pix = style === 'pixel', R = pix ? Math.max(18, Math.round(U / 2.4)) : U, Wc = Math.ceil(R * 1.7), Hc = Math.ceil(R * 1.6), ox = Wc / 2, oy = R * 0.92;
      const cv = document.createElement('canvas'), z = pix ? 1 : 2; cv.width = Wc * z; cv.height = Hc * z;
      const c = cv.getContext('2d'); c.scale(z, z); c.lineJoin = 'round'; c.lineCap = 'round';
      const pr = p => [ox + (p[0] + A * p[1]) * R, oy + (-B * p[1] - Cz * p[2]) * R];   // le sol au centre du modèle tombe au centre de la case
      const L1 = shade(col, 0.3), D1 = shade(col, -0.4), noir = '#1d1d1d';
      const teinte = (n, t) => { const l = dot(n, LUM); if (t === 'toit' || t === 'pignon') return shade(col, 0.12 + 0.25 * Math.max(0, l)); return l >= 0 ? shade(col, 0.2 * l) : shade(col, 0.18 * l); };
      const solides = MODELES[modele]().map(s => ({ f: s.f.map(f => ({ ...f, p: f.p.map(q => rot(q, k)), n: rot(f.n, k) })) }));
      for (const s of solides) { const m = s.f.flatMap(f => f.p), cx = m.reduce((a, p) => a + p[0], 0) / m.length, cy = m.reduce((a, p) => a + p[1], 0) / m.length, cz = m.reduce((a, p) => a + p[2], 0) / m.length; s.d = -A * cx + cy - (B / Cz) * cz; }
      solides.sort((a, b) => b.d - a.d);
      const vis = f => dot(f.n, CAM) > 1e-6;
      const chemin = pts => { c.beginPath(); pts.forEach((q, i) => { const [X, Y] = pr(q); i ? c.lineTo(X, Y) : c.moveTo(X, Y); }); c.closePath(); };
      // voies au sol (dans le repère tourné)
      const voies = () => { for (const [vx, y0, y1] of VOIES[modele]) {
        if (modele === 'u' || modele === 'uauvent') { if (y1 < 0.2) { c.fillStyle = '#efe9dc'; chemin([[vx - 0.1, y1 - 0.02, 0.0], [vx + 0.1, y1 - 0.02, 0.0], [vx + 0.1, y1 + 0.03, 0.0], [vx - 0.1, y1 + 0.03, 0.0]].map(q => rot(q, k))); c.fill(); c.strokeStyle = '#1d1d1d'; c.lineWidth = 1; c.stroke(); } continue; }   // les rails sont ceux du plateau, qui passent dessous
        c.fillStyle = '#5b4a3c'; chemin([[vx - 0.09, y0, 0], [vx + 0.09, y0, 0], [vx + 0.09, y1, 0], [vx - 0.09, y1, 0]].map(q => rot(q, k))); c.fill();
        if (y1 < 0.2) { c.fillStyle = '#efe9dc'; chemin([[vx - 0.08, y1 - 0.02, 0.0], [vx + 0.08, y1 - 0.02, 0.0], [vx + 0.08, y1 + 0.03, 0.0], [vx - 0.08, y1 + 0.03, 0.0]].map(q => rot(q, k))); c.fill(); }
        c.strokeStyle = '#c9ced2'; c.lineWidth = Math.max(1, R * 0.02); for (const dx of [-0.05, 0.05]) { c.beginPath(); const [a1, b1] = pr(rot([vx + dx, y0, 0], k)), [a2, b2] = pr(rot([vx + dx, y1, 0], k)); c.moveTo(a1, b1); c.lineTo(a2, b2); c.stroke(); } } };
      const faces = [];
      for (const s of solides) for (const f of s.f) if (vis(f)) faces.push(f);
      // ombre au sol
      c.fillStyle = style === 'maquette' ? 'rgba(0,0,0,.22)' : 'rgba(0,0,0,.28)';
      c.beginPath(); c.ellipse(ox + 0.04 * R, oy + 0.06 * R, 0.5 * R, 0.3 * R, 0, 0, 7); c.fill();
      voies();
      if (pix) { c.lineWidth = 2; c.strokeStyle = '#1d1d1d'; c.fillStyle = '#1d1d1d'; for (const f of faces) { chemin(f.p); c.stroke(); c.fill(); } }
      if (style === 'autocollant') for (const [w, cl] of [[0.16, 'rgba(10,20,14,.55)'], [0.1, '#ffffff']]) { c.lineWidth = w * R; c.strokeStyle = cl; c.fillStyle = cl; for (const f of faces) { chemin(f.p); c.stroke(); c.fill(); } }
      if (style === 'maquette') { c.save(); c.shadowColor = 'rgba(0,0,0,.35)'; c.shadowBlur = R * 0.12; c.shadowOffsetY = R * 0.05; c.fillStyle = '#000'; for (const f of faces) { chemin(f.p); c.fill(); } c.restore(); }
      for (const f of faces) {
        let fill = f.t === 'poteau' ? D1 : f.t === 'heurtoir' ? '#e9e4da' : teinte(f.n, f.t);
        chemin(f.p);
        if (style === 'maquette' && f.t !== 'poteau') { const [X0, Y0] = pr(f.p[0]), [X2, Y2] = pr(f.p[2]); const g = c.createLinearGradient(X0, Math.min(Y0, Y2), X0, Math.max(Y0, Y2) + 1); g.addColorStop(0, shade(col, 0.06 + (f.t === 'toit' || f.t === 'pignon' ? 0.3 : 0.08))); g.addColorStop(1, fill); fill = g; }
        c.fillStyle = fill; c.fill();
        if (style === 'ligne') { c.strokeStyle = noir; c.lineWidth = Math.max(1.2, R * 0.022); c.stroke(); }
        else if (style === 'autocollant' || style === 'maquette') { c.strokeStyle = 'rgba(0,0,0,.22)'; c.lineWidth = Math.max(0.8, R * 0.012); c.stroke(); }
          // décors de la face
        if (f.d) { const P0 = f.p[0], U3 = sub(f.p[1], f.p[0]), V3 = f.p.length === 4 ? sub(f.p[3], f.p[0]) : sub(f.p[2], [(f.p[0][0] + f.p[1][0]) / 2, (f.p[0][1] + f.p[1][1]) / 2, (f.p[0][2] + f.p[1][2]) / 2]);
          const Q = (u, v) => f.p.length === 4 ? [P0[0] + U3[0] * u + V3[0] * v, P0[1] + U3[1] * u + V3[1] * v, P0[2] + U3[2] * u + V3[2] * v] : [P0[0] + U3[0] * u + V3[0] * v, P0[1] + U3[1] * u + V3[1] * v, P0[2] + U3[2] * u + V3[2] * v];
          for (const [t, u0, v0, u1, v1] of f.d) {
            if (t === 'h') { const cu = (u0 + u1) / 2, cv2 = (v0 + v1) / 2, r = (u1 - u0) / 2; const pts = []; for (let i = 0; i < 16; i++) { const a = i / 16 * 6.283; pts.push(Q(cu + Math.cos(a) * r, cv2 + Math.sin(a) * r * 1.4)); } chemin(pts); c.fillStyle = '#f7f3e8'; c.fill(); c.strokeStyle = noir; c.lineWidth = Math.max(1, R * 0.015); c.stroke();
              c.beginPath(); let [a1, b1] = pr(Q(cu, cv2)), [a2, b2] = pr(Q(cu, cv2 + r * 1.1)), [a3, b3] = pr(Q(cu + r * 0.7, cv2)); c.moveTo(a2, b2); c.lineTo(a1, b1); c.lineTo(a3, b3); c.stroke(); continue; }
            const pts = t === 'a' || t === 'p' ? (() => { const r = (u1 - u0) / 2, pp = [[u0, v0]]; for (let i = 0; i <= 10; i++) { const a = Math.PI - i / 10 * Math.PI; pp.push([(u0 + u1) / 2 + Math.cos(a) * r, v1 - r * 0.9 + Math.sin(a) * r * 0.9]); } pp.push([u1, v0]); return pp; })() : [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
            chemin(pts.map(([u, v]) => Q(u, v))); c.fillStyle = t === 'a' ? '#141414' : t === 'p' ? D1 : (style === 'maquette' ? '#3d5566' : D1); c.fill();
            if (style === 'ligne') { c.strokeStyle = noir; c.lineWidth = Math.max(1, R * 0.015); c.stroke(); }
          } }
      }
      let out = cv;
      if (pix) { const big = document.createElement('canvas'), f = U / R; big.width = Math.ceil(Wc * f * 2); big.height = Math.ceil(Hc * f * 2); const b = big.getContext('2d'); b.imageSmoothingEnabled = false; b.drawImage(cv, 0, 0, big.width, big.height); out = big; out.__z = 2; out.__o = [ox * f, oy * f]; }
      else { out.__z = z; out.__o = [ox, oy]; }
      cache.set(key, out); return out;
    }
    // orientation : sens d'arrivée du train → rotation qui tourne l'entrée des voies vers lui
    function quart(inDir) { const tx = -DC[inDir], ty = DR[inDir]; return ty === -1 ? 0 : tx === 1 ? 1 : ty === 1 ? 2 : 3; }
    function dessine(c, modele, style, x, y, s, col, inDir, bad, kForce) {
      const U = s * 1.12, im = image(modele, style, col, kForce ?? quart(inDir ?? 0), U), z = im.__z;
      if (bad > 0) { c.fillStyle = `rgba(255,90,95,${0.35 + bad * 0.5})`; c.beginPath(); c.ellipse(x, y + s * 0.28, s * 0.62, s * 0.24, 0, 0, 7); c.fill(); }
      c.drawImage(im, x - im.__o[0], y - im.__o[1], im.width / z, im.height / z);
    }
    return { dessine, quart };
  })();
  // ---------- Ouvriers de chantier pendant la construction (feu rouge clignotant) ----------
  // une équipe par gare : elle sort du tunnel au front de construction, cogne aux aiguillages, entre dans la gare et disparaît
  function chemins() {
    const vis = board.stations.filter(s => s.vis !== false).length;
    if (board.chemins && board.chemins.vis === vis) return board.chemins;
    const m = mouth(), R = AIG.makeRng(board.nodes.length * 131 + 7);
    board.chemins = board.stations.filter(s => s.vis !== false).map((st, k) => {
      const ch = []; let n = st; while (n) { ch.unshift(n); n = n.parent; }
      const pts = [[m[0], m[1], 0]].concat(ch.map(n => [n.c + 0.5, n.r + 0.5, n.din + 0.5]));
      return { st, pts, fin: st.din + 0.5, lat: (R() - 0.5) * 0.22, lag: R() * 0.2, ph: R() * 6, sws: ch.filter(n => n.outs.length === 2 && !n.fixed).map(n => n.din + 0.5) };
    });
    board.chemins.vis = vis;
    return board.chemins;
  }
  function surChemin(pts, d) {
    for (let i = 1; i < pts.length; i++) if (d <= pts[i][2] || i === pts.length - 1) {
      const [x0, y0, d0] = pts[i - 1], [x1, y1, d1] = pts[i], t = clamp((d - d0) / Math.max(1e-6, d1 - d0), 0, 1);
      return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, Math.atan2(y1 - y0, x1 - x0)];
    }
    return [pts[0][0], pts[0][1], 0];
  }
  // rythme du chantier : presque régulier, pour qu'on voie les ouvriers avancer
  const chantier = x => x * (1.25 - 0.25 * x);
  function drawOuvriers(f, dt, growing) {
    const t = S.pt, u = cell, dur = growing ? S.growDur : BUILD;
    for (const w of chemins()) {
      if (growing && !w.st.grow) continue;   // Terminus : seulement les équipes des nouvelles gares
      const d = f - 0.15 - w.lag;
      if (d <= 0.05) continue;
      const arrive = clamp((d - w.fin + 0.1) / 0.35, 0, 1), fin = clamp((dur - 0.25 - t) / 0.2, 0, 1);   // entre dans la gare, et jamais après la fin du chantier
      const a = (1 - arrive) * fin; if (a <= 0) continue;
      const [px, py, ang] = surChemin(w.pts, Math.min(d, w.fin));
      const nx = -Math.sin(ang), ny = Math.cos(ang), x = X(px + nx * w.lat), y = Y(py + ny * w.lat);
      const cogne = w.sws.some(s => Math.abs(d - s) < 0.45), pas = Math.sin(t * 18 + w.ph);
      ctx.save(); ctx.globalAlpha = a; ctx.translate(x, y); ctx.rotate(ang); const k = u * 0.15 * (0.6 + 0.4 * a); ctx.scale(k, k);
      ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(0.25, 0.35, 1.05, 0.85, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#2d3b57'; ctx.beginPath(); ctx.ellipse(-0.1 + pas * 0.35, -0.38, 0.42, 0.2, 0, 0, 7); ctx.ellipse(-0.1 - pas * 0.35, 0.38, 0.42, 0.2, 0, 0, 7); ctx.fill();   // jambes
      ctx.fillStyle = '#ff7a1a'; ctx.beginPath(); ctx.ellipse(0, 0, 0.55, 0.78, 0, 0, 7); ctx.fill();   // gilet
      ctx.fillStyle = '#e8ff6a'; ctx.fillRect(-0.12, -0.78, 0.24, 1.56);   // bande réfléchissante
      const bras = cogne ? Math.sin(t * 30 + w.ph) * 0.9 : pas * 0.3;
      ctx.save(); ctx.translate(0.1, 0.62); ctx.rotate(0.6 + bras);
      ctx.fillStyle = '#7a5232'; ctx.fillRect(0, -0.08, 1.1, 0.16); ctx.fillStyle = '#9aa3aa'; ctx.fillRect(0.9, -0.28, 0.24, 0.56);   // marteau
      ctx.restore();
      ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(0.05, 0, 0.42, 0, 7); ctx.fill();   // casque
      ctx.fillStyle = '#e0b020'; ctx.fillRect(-0.05, -0.42, 0.1, 0.84);
      ctx.restore();
      if (cogne && Math.random() < dt * 14) for (let i = 0; i < 3; i++) S.particles.push({ x: x + (Math.random() - 0.5) * u * 0.2, y: y + (Math.random() - 0.5) * u * 0.2, vx: (Math.random() - 0.5) * 90, vy: -40 - Math.random() * 70, life: 0.35, r: 1.6, col: Math.random() < 0.5 ? '#ffe27a' : '#ffffff' });
    }
  }
  function drawSignal() {
    const m = mouth(), e = board.edge, mx = X(m[0]), my = Y(m[1]);
    const hw = cell * 0.17, hh = cell * 0.34;
    let cx, cy;
    const gt = geoTunnel(), cote = gt.side, ecart = cote * ((cote > 0 ? gt.R : gt.L) + 0.18) * cell;   // feu du côté libre, à côté du portail
    if (e === 'top') { cx = mx + ecart; cy = my - cell * 0.24; }
    else if (e === 'bottom') { cx = mx + ecart; cy = my + cell * 0.24; }
    else { cx = mx + (e === 'left' ? -1 : 1) * cell * 0.24; cy = my - cell * 0.62; }
    ctx.fillStyle = '#101a13'; rr(ctx, cx - hw, cy - hh, hw * 2, hh * 2, hw * 0.8); ctx.fill();
    const blink = (S.pt % 1) < 0.5;
    const red = mode === 'build' || mode === 'grow' ? blink : (mode === 'over' || mode === 'ending' || S.closing), green = mode === 'observe' ? blink : ((mode === 'playing' || mode === 'demo') && !S.closing);
    const lamp = (y, on, col, dim) => {
      ctx.fillStyle = on ? col : dim;
      if (on) { ctx.shadowColor = col; ctx.shadowBlur = cell * 0.4; }
      ctx.beginPath(); ctx.arc(cx, y, hw * 0.68, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
    };
    lamp(cy - hh * 0.48, red, '#ff4d4d', '#3a1c1c');
    lamp(cy + hh * 0.48, green, '#4dff88', '#1c3a25');
  }

  function banner(big) {
    ctx.fillStyle = 'rgba(16,30,21,.6)'; ctx.fillRect(0, H / 2 - cell * 0.8, W, cell * 1.6);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    let fs = Math.round(Math.min(48, cell * 0.8));
    ctx.font = `700 ${fs}px Fredoka, sans-serif`;
    while (fs > 12 && ctx.measureText(big).width > W * 0.9) { fs -= 2; ctx.font = `700 ${fs}px Fredoka, sans-serif`; }   // tient dans la largeur
    ctx.fillStyle = '#ffb703'; ctx.fillText(big, W / 2, H / 2);
  }

  function drawTrain(tr) {
    const tt = clamp(tr.t, 0, 1);
    let p = qpt(tr.seg, tt), a = qtan(tr.seg, tt);
    if (tr.blend > 0 && tr.prevSeg) { const q = qpt(tr.prevSeg, tt), k = tr.blend; p = [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k]; }
    const info = STATIONS[tr.dest], L = cell * 0.66, w = cell * 0.36;
    ctx.save(); ctx.translate(X(p[0]), Y(p[1])); ctx.rotate(a);
    ctx.fillStyle = 'rgba(0,0,0,.32)'; rr(ctx, -L / 2 + cell * 0.04, -w / 2 + cell * 0.06, L, w * 1.1, w * 0.3); ctx.fill();
    ctx.fillStyle = '#f3ecd9'; rr(ctx, -L / 2 - cell * 0.03, -w * 0.58 - cell * 0.03, L + cell * 0.06, w * 1.16 + cell * 0.06, w * 0.3); ctx.fill();   // liseré clair (lisible sur la voie)
    ctx.fillStyle = '#1b1c1d'; rr(ctx, -L / 2, -w * 0.58, L, w * 1.16, w * 0.25); ctx.fill();          // châssis et roues
    ctx.fillStyle = info.col; rr(ctx, -L * 0.47, -w * 0.45, L * 0.94, w * 0.9, w * 0.32); ctx.fill();   // caisse
    ctx.strokeStyle = shade(info.col, -0.35); ctx.lineWidth = 1.2; ctx.stroke();
    ctx.fillStyle = shade(info.col, -0.28); rr(ctx, -L * 0.47, -w * 0.45, L * 0.3, w * 0.9, w * 0.25); ctx.fill();   // cabine (arrière)
    ctx.fillStyle = '#bfe3f5'; ctx.fillRect(-L * 0.33, -w * 0.32, L * 0.05, w * 0.18); ctx.fillRect(-L * 0.33, w * 0.14, L * 0.05, w * 0.18);
    ctx.fillStyle = '#2a2a2a'; ctx.beginPath(); ctx.arc(L * 0.3, 0, w * 0.13, 0, 7); ctx.fill();          // cheminée
    ctx.fillStyle = '#ffe9a0'; ctx.beginPath(); ctx.arc(L * 0.47, 0, cell * 0.035, 0, 7); ctx.fill();     // phare
    ctx.restore();
  }


  // ---------- Liaison avec le cadre du hub ----------
  // Le bandeau est tenu par le hub : le jeu lui transmet seulement le temps de trafic restant (Niveaux),
  // car la construction et l'observation du réseau ne comptent pas dans les 2 minutes.
  let lastHud = '', lastSec = -1;
  function hud() {
    if (!S || S.demo || gm !== 'niveaux' || !opts.signaler) return;
    const rest = S.closing ? 0 : Math.max(0, DUREE - S.clock), sec = Math.ceil(rest);
    if (sec !== lastSec) { lastSec = sec; opts.signaler('temps', { restant: rest * 1000, total: DUREE * 1000 }); }
  }
  let fini = false;
  function showOver() {
    if (fini) return;
    fini = true; mode = 'over';
    opts.signaler('fin', {
      stats: [{ nom: 'Trains bien arrivés', valeur: gm === 'niveaux' ? `${S.ok} / ${nTrains(level)}` : String(S.ok) },
              { nom: 'Trains égarés', valeur: String(S.ko) }],
      journal: { ...S.log, palier: S.palier, t10: S.t10, score: S.score, ok: S.ok, ko: S.ko }
    });
  }
  let raf = 0, last = 0, enPause = false;
  function frame(ts) {
    const dt = Math.min(0.05, (ts - last) / 1000 || 0); last = ts;
    if (S && !enPause) update(dt);
    draw(enPause ? 0 : dt);
    raf = requestAnimationFrame(frame);
  }
  layout();
  if (opts.demo) startDemo(); else { gm = opts.gm; newGame(); }
  raf = requestAnimationFrame(frame);
  return {
    pause() { enPause = true; },
    reprendre() { enPause = false; last = performance.now(); },
    // fin demandée par le cadre (plus de vie) : le Terminus se termine comme à la 3e erreur
    terminer() {
      if (!S || S.demo || mode === 'ending' || mode === 'over') return;
      if (gm === 'niveaux') S.closing = true; else { mode = 'ending'; S.endT = 0.6; S.dead = true; }
    },
    arreter() { cancelAnimationFrame(raf); cv.removeEventListener('pointerdown', surToucher); },
    redimensionner() { layout(); }
  };
}

// ---------- Reprise des stats du prototype (clé v8, v15.5) au format du hub ----------
function importer() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem('brainer.aiguillages.stats.v8')); } catch (e) { /* stockage indisponible */ }
  if (!s) return null;
  const records = {};
  for (const [L, st] of Object.entries(s.levels || {})) if (st && st.played)
    records[`niveaux-${L}`] = { parties: st.played, score: st.best || 0, serie: st.bestSerie || 0, niveau: 0 };
  const sv = (s.modes || {}).survie || (s.modes || {}).mort;
  if (sv && sv.played) records.survie = { parties: sv.played, score: sv.best || 0, serie: sv.bestSerie || 0, niveau: sv.bestPalier || 0 };
  const parties = (s.history || []).filter(e => e.m === 'niveaux' || e.m === 'survie' || e.m === 'mort').reverse().map(e => {
    const sur = e.m !== 'niveaux';
    return { date: new Date(e.d).toISOString(), version: 'v15', mode: sur ? 'survie' : 'niveaux', niveau: sur ? 1 : e.L, score: e.s,
      max: sur ? null : 1000 * e.L, precision: e.ok + e.ko ? Math.round(1000 * e.ok / (e.ok + e.ko)) / 1000 : 0, serie: e.se || 0, niveauAtteint: sur ? e.L : null };
  });
  return { parties, records };
}

export default {
  id: 'aiguillages',
  nom: 'Aiguillages',
  categorie: 'att',
  version: 'v16',
  accroche: 'Chaque train à sa gare.',
  couleur: { nuit: '#ffb703', jour: '#9a4f00', contraste: '#e69f00' },
  vie: '<path fill-rule="evenodd" d="M6 3h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM7 6v4h10V6z"/><circle cx="8" cy="20" r="2"/><circle cx="16" cy="20" r="2"/>',
  tutoriel: [
    { titre: 'Le réseau se construit', texte: 'Pendant que le feu rouge clignote, les ouvriers posent les voies. Quand le vert clignote, règle tes aiguillages : le premier train part ensuite.' },
    { titre: 'Aiguille les trains', texte: 'Touche un aiguillage (disque) pour changer de voie : la voie ouverte est allumée. Chaque train a la couleur de sa gare.' },
    { titre: 'Marque des points', texte: 'Chaque train bien arrivé rapporte des points ; après une série sans faute, chaque train vaut plus. Partie parfaite : 1 000 × niveau.' }
  ],
  modes: {
    niveaux: { objectif: 'Maîtrises-tu ce niveau ? Environ 2 minutes de trafic.' },
    survie: { nom: 'Terminus', etape: 'Palier', objectif: 'Jusqu’où tiendras-tu ? Le réseau grandit à chaque palier. 3 vies.' }
  },
  niveaux: Array.from({ length: 10 }, (_, i) => ({ niveau: i + 1, seuil: nTrainsDu(i + 1), gares: PT[i + 1].g, trains: nTrainsDu(i + 1) })),
  importer,
  decor(canvas) { return moteur(canvas, { demo: true }); },
  partie({ canvas, mode, niveau, signaler }) { return moteur(canvas, { gm: mode, level: niveau, signaler }); }
};
