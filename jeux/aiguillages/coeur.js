// Aiguillages v15 — cœur partagé : générateur en peigne (v15), générateur par dichotomie (v14), géométrie, métriques, simulation.
// Module ES : importé par jeu.js (hub) et sous Node (labo de calibrage : import('./coeur.js')). Sans affichage.
const AIG = (() => {
  const DC = [0, 1, 0, -1], DR = [-1, 0, 1, 0], opp = d => (d + 2) & 3;

  function makeRng(seed) {
    let a = seed >>> 0;
    return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }

  // ---------------- Générateur ----------------
  // P : { cols, rows, N, edge ('top'|'bottom'|'left'|'right'), Lmin (cases entre 2 aiguillages),
  //       Ltun (cases du bord du tunnel au centre du 1er aiguillage), Lsta (cases aiguillage→gare),
  //       dminFrac (éloignement mini des gares, fraction de la distance max au tunnel) }
  function generate(P, rng = Math.random, maxAttempts = 400) {
    for (let i = 0; i < maxAttempts; i++) {
      const b = tryBuild(P, rng);
      if (b) { b.attempts = i + 1; return b; }
    }
    return null;
  }

  function tryBuild(P, rng) {
    const { cols, rows, N } = P;
    const rint = (a, b) => a + Math.floor(rng() * (b - a + 1));
    const idx = (c, r) => r * cols + c;
    const inb = (c, r) => c >= 0 && r >= 0 && c < cols && r < rows;

    // tunnel : tiers central du bord
    let T, d0;
    const midC = () => rint(Math.floor(cols / 3), Math.ceil(2 * cols / 3) - 1);
    const midR = () => rint(Math.floor(rows / 3), Math.ceil(2 * rows / 3) - 1);
    switch (P.edge) {
      case 'bottom': T = [midC(), rows - 1]; d0 = 0; break;
      case 'left': T = [0, midR()]; d0 = 1; break;
      case 'right': T = [cols - 1, midR()]; d0 = 3; break;
      default: T = [midC(), 0]; d0 = 2;
    }

    // gares : loin du tunnel, dispersées (échantillonnage « meilleur candidat »), jamais collées
    const man = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
    let maxD = 0; for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) maxD = Math.max(maxD, man([c, r], T));
    const dmin = Math.round(P.dminFrac * maxD);
    const zone = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (man([c, r], T) >= dmin) zone.push([c, r]);
    const st = [];
    for (let i = 0; i < N; i++) {
      const ok = zone.filter(z => st.every(s => Math.max(Math.abs(s[0] - z[0]), Math.abs(s[1] - z[1])) >= 2));
      if (!ok.length) return null;
      let best = null, bd = -1;
      for (let k = 0; k < 12; k++) {
        const z = ok[Math.floor(rng() * ok.length)];
        const d = st.length ? Math.min(...st.map(s => Math.hypot(s[0] - z[0], s[1] - z[1]))) : rng();
        if (d > bd) { bd = d; best = z; }
      }
      st.push(best);
    }

    // arbre par dichotomie spatiale
    function bsp(list, depth = 0) {
      if (list.length === 1) return { leaf: true, cell: list[0], st: list };
      let s;
      if (P.split === 'axis' || (P.split === 'hybrid' && depth > 0)) {
        const sx = Math.max(...list.map(p => p[0])) - Math.min(...list.map(p => p[0]));
        const sy = Math.max(...list.map(p => p[1])) - Math.min(...list.map(p => p[1]));
        const ax = sx > sy ? 0 : sx < sy ? 1 : (rng() < 0.5 ? 0 : 1);
        s = [...list].sort((a, b) => a[ax] - b[ax] || a[1 - ax] - b[1 - ax]);
      } else {
        // dichotomie angulaire vue depuis le tunnel : chaque moitié occupe un secteur, les voies ne se gênent pas
        const ox = T[0] + 0.5 - DC[d0] * 0.5, oy = T[1] + 0.5 - DR[d0] * 0.5, base = Math.atan2(DR[d0], DC[d0]);
        const ang = p => { let a = Math.atan2(p[1] + 0.5 - oy, p[0] + 0.5 - ox) - base; while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
        s = [...list].sort((a, b) => ang(a) - ang(b));
      }
      const h = rng() < 0.5 ? Math.floor(s.length / 2) : Math.ceil(s.length / 2);
      return { leaf: false, st: list, kids: [bsp(s.slice(0, h), depth + 1), bsp(s.slice(h), depth + 1)] };
    }
    const tree = bsp(st);
    const centroid = t => [t.st.reduce((a, p) => a + p[0], 0) / t.st.length, t.st.reduce((a, p) => a + p[1], 0) / t.st.length];

    // occupation : 0 libre, 1 voie, 2 gare réservée
    const occ = new Array(cols * rows).fill(0);
    st.forEach(s => { occ[idx(s[0], s[1])] = 2; });
    occ[idx(T[0], T[1])] = 1;
    const dist = new Map([[idx(T[0], T[1]), 0.5]]), swD = [];
    const okD = D => !P.mod || swD.every(E => E === D || Math.abs(((D - E) % P.mod + P.mod) % P.mod) > 1e-9);
    const edges = [];   // { from:[c,r], cells:[[c,r,dirIn]...], leave: dir }  (dernière cellule = nœud enfant)
    let budget = P.budget || 6000;

    // routes depuis A en partant dans la direction dl, au plus 1 virage
    function routes(A, dl, allowZeroK) {
      const out = [];
      const perps = [(dl + 1) & 3, (dl + 3) & 3];
      for (let k = allowZeroK ? 0 : 1; ; k++) {
        const kc = A[0] + DC[dl] * k, kr = A[1] + DR[dl] * k;
        if (!inb(kc, kr)) break;
        if (k > 0 && occ[idx(kc, kr)] === 1) break;
        const straight = [];
        for (let i = 1; i <= k; i++) straight.push([A[0] + DC[dl] * i, A[1] + DR[dl] * i, dl]);
        if (k > 0) out.push({ cells: straight, end: [kc, kr], din: dl });   // arrivée en ligne droite
        if (k > 0 && occ[idx(kc, kr)] === 2) break;                         // une gare bloque la suite
        for (const p of perps) {
          const path = straight.slice();
          let cc = kc, cr = kr;
          for (let m = 1; ; m++) {
            cc += DC[p]; cr += DR[p];
            if (!inb(cc, cr) || occ[idx(cc, cr)] === 1) break;
            path.push([cc, cr, p]);
            out.push({ cells: path.slice(), end: [cc, cr], din: p, corner: k > 0 || allowZeroK });
            if (occ[idx(cc, cr)] === 2) break;
          }
        }
      }
      return out;
    }

    function commit(rt) { const saved = rt.cells.map(([c, r]) => occ[idx(c, r)]); rt.cells.forEach(([c, r]) => { occ[idx(c, r)] = 1; }); return saved; }
    function undo(rt, saved) { rt.cells.forEach(([c, r], i) => { occ[idx(c, r)] = saved[i]; }); }
    // les cellules intermédiaires doivent être libres (0) ; la dernière : libre pour un aiguillage, la bonne gare pour une gare
    function valid(rt, t) {
      for (let i = 0; i < rt.cells.length - 1; i++) if (occ[idx(rt.cells[i][0], rt.cells[i][1])] !== 0) return false;
      const e = rt.end, v = occ[idx(e[0], e[1])];
      if (t.leaf) return e[0] === t.cell[0] && e[1] === t.cell[1];
      return v === 0;
    }

    // pile de tâches : relier un parent (cellule, direction de sortie) à un sous-arbre
    function solve(stack) {
      if (--budget <= 0) return false;
      if (!stack.length) return true;
      const task = stack[stack.length - 1], rest = stack.slice(0, -1);
      const { A, dl, t, minSteps, isRoot } = task;
      // gare : on peut la décaler d'une case si ça permet une voie conforme (dispersion conservée)
      if (t.leaf && P.stationSlack) {
        const orig = t.cell, targets = [orig];
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const c = orig[0] + dc, r = orig[1] + dr;
          if (!inb(c, r) || occ[idx(c, r)] !== 0) continue;
          if (st.some(o => o !== orig && Math.max(Math.abs(o[0] - c), Math.abs(o[1] - r)) < 2)) continue;
          targets.push([c, r]);
        }
        for (let i = 1; i < targets.length; i++) { const j = 1 + Math.floor(rng() * (targets.length - 1)); [targets[i], targets[j]] = [targets[j], targets[i]]; }
        const si = st.indexOf(orig);
        for (const tg of targets) {
          if (tg !== orig) { occ[idx(orig[0], orig[1])] = 0; occ[idx(tg[0], tg[1])] = 2; st[si] = tg; t.cell = tg; }
          const okk = leafTry(task, rest);
          if (tg !== orig) { occ[idx(tg[0], tg[1])] = 0; occ[idx(orig[0], orig[1])] = 2; st[si] = orig; t.cell = orig; }
          if (okk) { t.cell = tg; return true; }
          if (budget <= 0) return false;
        }
        return false;
      }
      if (t.leaf) return leafTry(task, rest);
      return switchTry(task, rest);
    }
    function optionsFor(task) {
      const { A, dl, t, minSteps, isRoot } = task;
      let opts = [];
      if (isRoot) {
        // depuis l'entrée : tout droit avec 0 ou 1 virage, ou virage dans la cellule d'entrée puis tout droit
        for (const rt of routes(A, d0, false)) opts.push(rt);
        for (const p of [(d0 + 1) & 3, (d0 + 3) & 3]) for (const rt of routes(A, p, false)) if (rt.cells.every(c => c[2] === p)) opts.push(rt);
      } else opts = routes(A, dl, false);
      opts = opts.filter(rt => rt.cells.length >= minSteps && (!isRoot || rt.cells.length <= minSteps + (P.tunSlack ?? 2)) && valid(rt, t));
      if (P.noCurveAtSwitch) opts = opts.filter(rt => {
        const d0 = rt.cells[0][2], kc = rt.cells.filter(c => c[2] === d0).length - 1;   // indice de la case de virage
        if (kc === rt.cells.length - 1) return true;                                     // pas de virage
        if (!isRoot && kc === 0 && (t.leaf || P.noCurveAfterToSwitch !== false)) return false;   // virage juste après l'aiguillage parent
        if (P.noCurveBefore !== false && !t.leaf && kc === rt.cells.length - 2) return false;   // virage juste avant l'aiguillage enfant
        return true;
      });
      return opts;
    }
    function leafTry(task, rest) {
      const { A, dl, t, isRoot } = task, opts = optionsFor(task);
      {
        const D0 = dist.get(idx(A[0], A[1]));
        for (const rt of opts) {
          rt.cells.forEach(([c, r], i) => dist.set(idx(c, r), D0 + i + 1));
          const saved = commit(rt);
          edges.push({ from: A, leave: isRoot ? rt.cells[0][2] : dl, cells: rt.cells, t });
          if (solve(rest)) return true;
          edges.pop(); undo(rt, saved);
        }
        return false;
      }
    }
    function switchTry(task, rest) {
      const { A, dl, t, isRoot } = task; let opts = optionsFor(task);
      // aiguillage : choisir les meilleures positions (proches du sous-arbre, avant lui)
      const cen = centroid(t);
      opts.forEach(rt => { rt.score = Math.hypot(rt.end[0] - cen[0], rt.end[1] - cen[1]) * 0.6 + rt.cells.length * (P.longRoutes ? -0.35 : 0.15) + rng() * 1.2; });
      opts.sort((a, b) => a.score - b.score);
      const D0 = dist.get(idx(A[0], A[1]));
      for (const rt of opts.filter(o => okD(D0 + o.cells.length)).slice(0, 6)) {
        const X = rt.end, din = rt.din, D = D0 + rt.cells.length;
        rt.cells.forEach(([c, r], i) => dist.set(idx(c, r), D0 + i + 1)); swD.push(D);
        const allowed = [din, (din + 1) & 3, (din + 3) & 3];
        const pairs = [];
        for (const a of allowed) for (const b of allowed) if (a !== b) {
          const ca = centroid(t.kids[0]), cb = centroid(t.kids[1]);
          const s = -(DC[a] * (ca[0] - X[0]) + DR[a] * (ca[1] - X[1])) - (DC[b] * (cb[0] - X[0]) + DR[b] * (cb[1] - X[1])) + rng() * 0.5;
          pairs.push([a, b, s]);
        }
        pairs.sort((p, q) => p[2] - q[2]);
        const saved = commit(rt);
        edges.push({ from: A, leave: isRoot ? rt.cells[0][2] : dl, cells: rt.cells, t, sw: true });
        for (const [a, b] of pairs) {
          const kidTask = (k, d) => ({ A: X, dl: d, t: t.kids[k], minSteps: t.kids[k].leaf ? P.Lsta : P.Lmin });
          if (solve([...rest, kidTask(1, b), kidTask(0, a)])) return true;
          if (budget <= 0) break;
        }
        edges.pop(); undo(rt, saved); swD.pop();
        if (budget <= 0) return false;
      }
      return false;
    }

    // le tunnel compte 0,5 case (bord → centre de l'entrée) : Ltun − 0,5 pas au minimum
    const ok = solve([{ A: T, dl: d0, t: tree, minSteps: Math.max(1, Math.ceil(P.Ltun - 0.5)), isRoot: true }]);
    if (!ok) return null;
    // pas de virage inutile juste avant une gare : si la voie tourne dans la case qui précède la gare,
    // la gare prend la place du virage (voie droite, une case plus courte), si elle reste à l'écart des autres gares
    if (P.trimStations !== false) {
      const leaves = edges.filter(e => e.t.leaf);
      for (const e of leaves) {
        const n = e.cells.length;
        if (n < 2 || n - 1 < (P.Lsta || 1) || e.cells[n - 1][2] === e.cells[n - 2][2]) continue;
        const [c, r] = e.cells[n - 2];
        if (leaves.some(o => o !== e && Math.max(Math.abs(o.cells[o.cells.length - 1][0] - c), Math.abs(o.cells[o.cells.length - 1][1] - r)) < 2)) continue;
        e.cells.pop();
      }
    }
    // zone de jeu placée dans la grille fixe, collée au bord du tunnel et centrée
    const FC = P.fullCols || cols, FR = P.fullRows || rows;
    let oc = Math.floor((FC - cols) / 2), or = Math.floor((FR - rows) / 2);
    if (P.edge === 'top' || !P.edge) or = 0; else if (P.edge === 'bottom') or = FR - rows;
    else if (P.edge === 'left') oc = 0; else if (P.edge === 'right') oc = FC - cols;
    const sh = ([c, r, ...x]) => [c + oc, r + or, ...x];
    const b = assemble({ ...P, cols: FC, rows: FR }, sh(T), d0, edges.map(e => ({ ...e, from: sh(e.from), cells: e.cells.map(sh) })));
    b.zone = { c: oc, r: or, cols, rows };
    // 1er tronçon : entre tunK × Fmin et tunK × Fmin + tunPlus cases
    const m = metrics(b);
    if (m.tunnel < (P.tunK || 1) * m.gapMin - 1e-6) return null;
    if (P.tunPlus != null && m.tunnel > (P.tunK || 1) * m.gapMin + P.tunPlus + 1e-6) return null;
    if (P.mod && !checkFlow(b, P.slot || 2.5, P.delta || 0.5)) return null;
    if (P.lenBand && (m.lenMean < P.lenBand[0] || m.lenMean > P.lenBand[1])) return null;
    b.m = m;
    return b;
  }

  // ---------------- Générateur en peigne (v15) ----------------
  // Grille fixe cols × rows ; tunnel en haut ou en bas, colonne col ; premier tronçon vertical de L0 cases ;
  // peigne : chaque aiguillage a une gare d'un côté et continue de l'autre ; `partages` aiguillages partagent le flux.
  function generatePeigne(o, rng = Math.random) {
    const cols = o.cols, rows = o.rows, N = o.N, L0 = o.L0, voieMax = o.voieMax ?? 2;
    const d0 = o.edge === 'bottom' ? 0 : 2, r0 = o.edge === 'bottom' ? rows - 1 : 0, col = o.col;
    let budget = o.budget || 20000, occ = new Array(cols * rows).fill(null);
    const libre = (c, r) => c >= 0 && r >= 0 && c < cols && r < rows && !occ[r * cols + c];
    const nLibres = () => { let n = 0; for (const x of occ) if (!x) n++; return n; };
    const mel = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    function sous(c, r, dir, k, voie, nb) {
      if (--budget <= 0 || !libre(c, r) || nLibres() < 2 * k - 1) return null;
      const i = r * cols + c, choix = [];
      if (k === 1) choix.push('gare', 'gare');
      if (k >= 2) choix.push('aig', 'aig', 'aig');
      if (voie < voieMax) choix.push('voie');
      for (const ch of mel(choix)) {
        if (ch === 'gare') { occ[i] = { t: 'gare', c, r, dir, outs: [] }; return { nb }; }
        if (ch === 'voie') for (const d of mel([dir, (dir + 1) & 3, (dir + 3) & 3])) {
          occ[i] = { t: 'voie', c, r, dir, outs: [d] };
          const s = sous(c + DC[d], r + DR[d], d, k, voie + 1, nb); if (s) return s;
          occ[i] = null; if (budget <= 0) return null;
        }
        if (ch === 'aig') {
          const so = [dir, (dir + 1) & 3, (dir + 3) & 3], parts = [[1, k - 1]];
          if (nb > 0 && k >= 4) { const ka = 2 + Math.floor(rng() * (k - 3)); parts.unshift([ka, k - ka]); }   // partage inégal possible : profondeurs variées
          for (const [ka, kb] of parts) for (const [a, b] of mel([[0, 1], [0, 2], [1, 2], [1, 0], [2, 0], [2, 1]])) {
            const avant = occ.slice(); occ[i] = { t: 'aig', c, r, dir, outs: [so[a], so[b]] };
            const A = sous(c + DC[so[a]], r + DR[so[a]], so[a], ka, 0, ka > 1 ? nb - 1 : nb);
            const B = A && sous(c + DC[so[b]], r + DR[so[b]], so[b], kb, 0, A.nb);
            if (B) return B;
            occ = avant; if (budget <= 0) return null;
          }
        }
      }
      return null;
    }
    for (let k = 0; k < L0; k++) occ[(r0 + DR[d0] * k) * cols + col] = { t: 'voie', c: col, r: r0 + DR[d0] * k, dir: d0, outs: [d0] };
    if (!sous(col, r0 + DR[d0] * L0, d0, N, 0, o.partages ?? 1)) return null;
    // arêtes d'une case, dans l'ordre des sorties (état 0 = première sortie), au format d'assemble
    const edges = [], file = [occ[r0 * cols + col]];
    while (file.length) { const x = file.shift(); for (const d of x.outs) { const y = occ[(x.r + DR[d]) * cols + x.c + DC[d]]; edges.push({ from: [x.c, x.r], cells: [[y.c, y.r, d]] }); file.push(y); } }
    const b = assemble({ cols, rows, edge: o.edge, N }, [col, r0], d0, edges);
    b.zone = { c: 0, r: 0, cols, rows }; b.m = metrics(b);
    return b;
  }
  // Ordonnancement (v15) : un tap dans chaque fenêtre { open, close }, au moins tTap entre deux taps.
  // Au plus tôt par échéance : prudent (peut refuser un cas faisable, jamais l'inverse).
  function planifier(taches, now, tTap) {
    const r = taches.slice().sort((a, b) => a.open - b.open), ouv = [];
    let t = now, k = 0;
    while (k < r.length || ouv.length) {
      if (!ouv.length && r[k].open > t) t = r[k].open;
      while (k < r.length && r[k].open <= t + 1e-9) ouv.push(r[k++]);
      ouv.sort((a, b) => a.close - b.close);
      const x = ouv.shift();
      if (t > x.close + 1e-9) return false;
      t += tTap;
    }
    return true;
  }

  // Construction des nœuds par case (format du rendu) + géométrie
  function assemble(P, T, d0, edges) {
    const { cols, rows } = P;
    const grid = new Array(cols * rows).fill(null), nodes = [];
    const mk = (c, r, inDir, parent) => { const n = { c, r, inDir, outs: [], parent, state: 0, locked: false, pulse: 0 }; grid[r * cols + c] = n; nodes.push(n); return n; };
    const entry = mk(T[0], T[1], d0, null);
    for (const e of edges) {
      let prev = grid[e.from[1] * cols + e.from[0]];
      for (const [c, r, d] of e.cells) {
        prev.outs.push(d);
        prev = mk(c, r, d, prev);
      }
    }
    const b = { cols, rows, grid, nodes, entry, edge: P.edge, N: P.N };
    b.switches = nodes.filter(n => n.outs.length === 2);
    b.stations = nodes.filter(n => n.outs.length === 0);
    for (const n of nodes) {
      const cx = n.c + 0.5, cy = n.r + 0.5, es = opp(n.inDir);
      const A = [cx + DC[es] * 0.5, cy + DR[es] * 0.5];
      const mkSeg = (B, C) => {
        const seg = { A, B, C, pts: [] };
        let len = 0, pv = A;
        for (let i = 0; i <= 16; i++) { const p = qpt(seg, i / 16); seg.pts.push(p); if (i) len += Math.hypot(p[0] - pv[0], p[1] - pv[1]); pv = p; }
        seg.glen = len; seg.len = B[0] === cx && B[1] === cy ? 0.5 : 1; return seg;
      };
      n.segs = n.outs.length ? n.outs.map(d => mkSeg([cx + DC[d] * 0.5, cy + DR[d] * 0.5], [cx, cy])) : [mkSeg([cx, cy], [(A[0] + cx) / 2, (A[1] + cy) / 2])];
    }
    // distance au bord du tunnel à l'entrée de chaque case (le long de l'arbre)
    const stack = [[entry, 0]];
    while (stack.length) {
      const [n, d] = stack.pop(); n.din = d;
      n.outs.forEach((o, i) => { const ch = grid[(n.r + DR[o]) * cols + n.c + DC[o]]; stack.push([ch, d + n.segs[i].len]); });
    }
    return b;
  }

  // Vérification « flux numéroté » : un train à chaque créneau (toutes les s secondes), dédoublé à chaque aiguillage.
  // Deux numéros différents à moins de delta l'un de l'autre sur des aiguillages => réseau refusé.
  function checkFlow(b, s = 2.5, delta = 0.5) {
    const d = b.switches.map(n => n.din), K = Math.ceil(Math.max(...d) / s) + 3, ev = [];
    for (let k = 0; k < K; k++) for (const x of d) ev.push([k * s + x, k]);
    ev.sort((a, c) => a[0] - c[0]);
    for (let i = 0; i < ev.length; i++) for (let j = i + 1; j < ev.length && ev[j][0] - ev[i][0] < delta - 1e-9; j++) if (ev[j][1] !== ev[i][1]) return false;
    return true;
  }

  function qpt(s, t) { const u = 1 - t; return [u * u * s.A[0] + 2 * u * t * s.C[0] + t * t * s.B[0], u * u * s.A[1] + 2 * u * t * s.C[1] + t * t * s.B[1]]; }
  function qtan(s, t) { const u = 1 - t; return Math.atan2(2 * u * (s.C[1] - s.A[1]) + 2 * t * (s.B[1] - s.C[1]), 2 * u * (s.C[0] - s.A[0]) + 2 * t * (s.B[0] - s.C[0])); }
  const child = (b, n, i) => b.grid[(n.r + DR[n.outs[i]]) * b.cols + n.c + DC[n.outs[i]]];

  // Survie : réseau complet construit d'avance, dévoilé gare par gare (de la plus proche du tunnel à la plus lointaine)
  function revealOrder(b, rng = Math.random) { b.revealOrder = b.stations.map(s => [s, s.din + rng() * 0.5]).sort((x, y) => x[1] - y[1]).map(x => x[0]); return b.revealOrder; }
  // rend visibles les g premières gares ; un aiguillage dont une seule branche est visible devient une voie fixe orientée vers elle
  function reveal(b, g) {
    const vis = b.revealOrder.slice(0, g);
    for (const n of b.nodes) n.vis = false;
    for (const s of vis) { let n = s; while (n && !n.vis) { n.vis = true; n = n.parent; } }
    for (const sw of b.switches) {
      const v = [0, 1].map(i => child(b, sw, i).vis);
      sw.fixed = !(v[0] && v[1]);
      if (sw.vis && sw.fixed && !v[sw.state]) sw.state = v[0] ? 0 : 1;
    }
    return vis;
  }
  // vue partielle d'un plan (gares visibles, vrais aiguillages) pour la simulation
  const visibleView = b => { const st = b.stations.filter(s => s.vis); return { ...b, N: st.length, stations: st, switches: b.switches.filter(s => s.vis && !s.fixed) }; };

  // Itinéraire de chaque gare : aiguillages traversés, état requis, distances
  function routesOf(b) {
    const res = [];
    for (const s of b.stations) {
      const sws = [];
      let n = s;
      while (n.parent) {
        const p = n.parent;
        if (p.outs.length === 2 && !p.fixed) sws.unshift({ sw: p, state: p.outs.findIndex((o, i) => child(b, p, i) === n), din: p.din, dout: p.din + p.segs[0].len });
        n = p;
      }
      res.push({ station: s, sws, len: s.din + s.segs[0].len });
    }
    return res;
  }

  // Métriques statiques d'un plan (en cases ; diviser par la vitesse pour des secondes)
  function metrics(b) {
    const R = routesOf(b);
    const depth = R.map(r => r.sws.length);
    let gapMin = Infinity, tunnel = Infinity;
    for (const r of R) {
      if (r.sws.length) tunnel = Math.min(tunnel, r.sws[0].din);
      for (let i = 1; i < r.sws.length; i++) gapMin = Math.min(gapMin, r.sws[i].din - r.sws[i - 1].din);
    }
    return {
      G: b.N, S: b.switches.length,
      Pmax: Math.max(...depth), Pmean: depth.reduce((a, x) => a + x, 0) / depth.length,
      gapMin, tunnel,
      lenMean: R.reduce((a, r) => a + r.len, 0) / R.length,
      lenMax: Math.max(...R.map(r => r.len)),
      cells: b.nodes.length,
    };
  }

  // ---------------- Cadence des trains (partagée jeu / simulation) ----------------
  // L : { v, gap0, gap1, burst:[p1,p2,p3] (salves visées en fin de montée), intraK (écart dans une salve, en écarts mini entre aiguillages) }
  function makeSpawner(b, L, rng = Math.random, dur = 120) {
    const intra = (L.intraK || 2) * b.m.gapMin / L.v;   // deux trains d'une salve : intraK aiguillages d'écart
    let left = 0;
    const gapAt = t => (L.gap0 + (L.gap1 - L.gap0) * Math.pow(Math.min(1, t / dur), 0.85)) * (0.88 + rng() * 0.24);
    const pick = t => {
      const p = L.burst || [1, 0, 0], k = Math.min(1, t / (dur / 2));
      const q = [1 - k + k * p[0], k * (p[1] || 0), k * (p[2] || 0)];
      let x = rng() * (q[0] + q[1] + q[2]);
      for (let i = 0; i < 3; i++) { if ((x -= q[i]) <= 0) return i + 1; }
      return 1;
    };
    return { intra, next(t) {
      if (left > 0) { left--; return intra; }
      const k = pick(t); left = k - 1;
      return Math.max(intra, k * gapAt(t) - (k - 1) * intra);
    } };
  }

  // Compte-gouttes (comme Averse) : part régulière + part aléatoire (réserve de multiplicateurs de moyenne 1)
  function makeDropper(L, rng = Math.random, dur = 120) {
    const reg = L.regular ?? 0.6;
    const mean = t => L.gap0 + (L.gap1 - L.gap0) * Math.pow(Math.min(1, t / dur), 0.85);
    const RES = [0.25, 0.4, 0.55, 0.7, 0.85, 1, 1, 1.15, 1.3, 1.5, 1.8, 2.5];   // moyenne 1,0
    let bag = [];
    const draw = () => { if (!bag.length) { bag = RES.slice(); for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; } } return bag.pop(); };
    let tReg = 0, tRnd = reg < 1 ? 0.5 * mean(0) / (1 - reg) : Infinity, pending = 0;
    return {
      tick(t, dt) {
        tReg -= dt; tRnd -= dt;
        if (tReg <= 0) { pending++; tReg += reg > 0 ? mean(t) / reg : Infinity; }
        if (tRnd <= 0) { pending++; tRnd += draw() * mean(t) / (1 - reg); }
        pending = Math.min(pending, L.maxPending || 2);
      },
      get pending() { return pending; }, take() { pending--; },
    };
  }
  // Plan de départs : exactement N créneaux remplis sur la partie, choisis par le double compte-gouttes
  function planSlots(L, N, rng = Math.random, dur = 120) {
    const nSlots = Math.floor((dur - 1e-9) / L.slot) + 1;
    N = Math.min(N, nSlots);
    let scale = 1, last = null;
    for (let a = 0; a < 400; a++) {
      const d = makeDropper({ ...L, gap0: L.gap0 * scale, gap1: L.gap1 * scale }, rng, dur);
      d.tick(0, 1e-3);
      const slots = []; let t = 0;
      for (let k = 0; k < nSlots; k++) {
        const ts = k * L.slot;
        while (t < ts) { d.tick(t, 0.05); t += 0.05; }
        if (d.pending > 0) { slots.push(k); d.take(); }
      }
      if (slots.length === N) return slots;
      last = slots;
      scale *= Math.pow(slots.length / N, 0.35);
    }
    const set = new Set(last);   // repli : on complète ou on retire au hasard
    while (set.size > N) set.delete([...set][Math.floor(rng() * set.size)]);
    while (set.size < N) set.add(Math.floor(rng() * nSlots));
    return [...set].sort((a, c) => a - c);
  }

  // Instants d'arrivée aux aiguillages encore devant chaque train (trajet prévu)
  function futureEvents(trains, t, v) {
    const ev = [];
    for (const tr of trains) if (tr.onPlan !== false) for (const x of tr.route.sws) if (x.din > tr.s) ev.push([t + (x.din - tr.s) / v, x.sw, x.state]);
    return ev;
  }
  // Destination compatible : aucun de ses passages à moins de delta d'un passage déjà prévu
  // deltaSame : même aiguillage, positions opposées (verrou pendant le passage + temps d'agir)
  function pickDest(order, routesByStation, ev, t, v, delta, deltaSame = 0) {
    for (const st of order) {
      const r = routesByStation.get(st);
      if (r.sws.every(x => {
        const at = t + x.din / v;
        return ev.every(([e, sw, state]) => sw === x.sw ? (state === x.state || Math.abs(e - at) >= deltaSame) : Math.abs(e - at) >= delta);
      })) return st;
    }
    return null;
  }

  // ---------------- Simulation ----------------
  // L : { v, gap0, gap1, duration } ; bot : { tId0, tIdK, tAct, K, pErr } ou null (aucun joueur)
  function simulate(b, L, bot, rng = Math.random) {
    const R = routesOf(b), byStation = new Map(R.map(r => [r.station, r]));
    const dur = L.duration || 120, dt = 0.02, v = L.v;
    b.switches.forEach(s => { s.state = rng() < 0.5 ? 0 : 1; s.locked = false; });
    const trains = [];
    let t = 0, spawnT = 0, bag = [], lastDest = null, ok = 0, ko = 0, maxC = 0, needed = 0, neededLate = 0, taps = 0, tapsEnd = 0;
    const spawner = makeSpawner(b, L, rng, dur); const dropper = makeDropper(L, rng, dur); let spawned = 0, blocked = 0, slotT = 0, slotK = -1, workSum = 0, conflicts = 0;
    const countConf = st => { let n = 0; byStation.get(st).sws.forEach((x, rank) => { if (!rank) return; for (const o of trains) if (o.onPlan) { const y = o.route.sws.find(z => z.sw === x.sw); if (y && o.s < y.din + CA && y.state !== x.state && (x.din - (y.din - o.s)) / v <= (L.cwin || 4)) { n++; break; } } }); return n; }; const plan = new Set(L.N ? planSlots(L, L.N, rng, dur) : []); const CA = L.commitAt || 0; const passes = [], spawnLog = [];
    const nextDest = () => {
      if (!bag.length) { bag = [...b.stations]; for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; } if (bag[bag.length - 1] === lastDest) bag.unshift(bag.pop()); }
      return (lastDest = bag.pop());
    };
    let busy = 0, action = null;
    const tIdOf = () => bot.tId0 + bot.tIdK * Math.log2(b.N);
    let seq = 0;
    while (t < dur || trains.length) {
      if (t > dur + 120) break;
      // apparition (plus aucun train une fois le temps écoulé)
      if (L.slot) {
        if (!L.N && t < dur) dropper.tick(t, dt);
        slotT -= dt;
        if (slotT <= 0) {
          slotT += L.slot; slotK++;
          if (t < dur && (L.N ? plan.has(slotK) : dropper.pending > 0)) {
            let dest;
            if (L.work) {
              // charge de travail : parmi les k prochaines gares de la pioche, celle qui exigera le plus de basculements
              if (!bag.length) { bag = [...b.stations]; for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; } }
              const cand = bag.slice(-L.work);
              let best = null, bw = -1;
              for (const c of cand) {
                let w = 0;
                byStation.get(c).sws.forEach((x, rank) => {
                  let need = x.sw.state, conflict = false;
                  for (const o of trains) if (o.onPlan) {
                    const y = o.route.sws.find(z => z.sw === x.sw);
                    if (y && o.s < y.din + CA) {
                      need = y.state;
                      // conflit : un train qui passe peu avant sur le même aiguillage (au-delà du 1er) demande l'autre voie
                      const gap = (x.din - (y.din - o.s)) / v;   // écart entre les deux passages
                      if (rank > 0 && y.state !== x.state && gap <= (L.cwin || 4)) conflict = true;
                    }
                  }
                  if (need !== x.state) w++;
                  if (conflict) {
                    w += L.cw || 0;
                    // conflits enchaînés : d'autres trains arrivent sur d'autres aiguillages à ±1 s de ce rebasculement
                    if (L.cs) { const tc = x.din / v; for (const o of trains) if (o.onPlan) for (const y of o.route.sws) if (y.sw !== x.sw && y.din + CA > o.s && Math.abs((y.din - o.s) / v - tc) <= 1) w += L.cs; }
                  }
                });
                if (w > bw || (w === bw && rng() < 0.5)) { bw = w; best = c; }
              }
              bag.splice(bag.indexOf(best), 1); dest = best; workSum += bw; conflicts += countConf(best);
            } else dest = nextDest();
            trains.push({ id: seq++, s: 0, node: b.entry, oi: 0, dest, route: byStation.get(dest), idd: false, onPlan: true, born: t });
            spawnLog.push([t, dest]); dropper.take(); spawned++;
          }
        }
      } else if (L.dropper) {
        if (t < dur) dropper.tick(t, dt);
        const last = trains[trains.length - 1];
        if (t < dur && dropper.pending > 0 && (!last || last.s >= (L.minSpacing || 1.2))) {
          if (!bag.length) { bag = [...b.stations]; for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; } }
          const order = [...bag].reverse().concat(b.stations.filter(x => !bag.includes(x)));
          const dest = L.delta ? pickDest(order, byStation, futureEvents(trains, t, v), t, v, L.delta, L.deltaSame || 0) : order[0];
          if (dest) {
            const i = bag.indexOf(dest); if (i >= 0) bag.splice(i, 1);
            trains.push({ id: seq++, s: 0, node: b.entry, oi: 0, dest, route: byStation.get(dest), idd: false, onPlan: true, born: t });
            spawnLog.push([t, dest]); dropper.take(); spawned++;
          } else blocked++;
        }
      } else {
      spawnT -= dt;
      if (spawnT <= 0 && t < dur) {
        const last = trains[trains.length - 1];
        if (!last || last.s >= 1.2) {
          const dest = nextDest();
          trains.push({ id: seq++, s: 0, node: b.entry, oi: 0, dest, route: byStation.get(dest), idd: false, onPlan: true, born: t });
          spawnT = spawner.next(t);
        } else spawnT = 0.1;
      }
      }
      // déplacement (même logique que le jeu : l'état est lu à l'entrée dans la case)
      for (const tr of trains) {
        tr.s += v * dt;
        while (!tr.done) {
          const n = tr.node, segEnd = n.din + n.segs[tr.oi].len;
          if (tr.s < segEnd) break;
          if (!n.outs.length) { tr.done = true; if (n === tr.dest) ok++; else ko++; break; }
          const ch = child(b, n, tr.oi);
          tr.node = ch; tr.oi = ch.outs.length === 2 ? ch.state : 0; tr.committed = ch.outs.length !== 2;
        }
        // la voie est choisie quand le train atteint CA case dans l'aiguillage (0 = à l'entrée, 0,5 = au centre)
        const n = tr.node;
        if (!tr.done && n.outs.length === 2 && !tr.committed && tr.s >= n.din + CA) {
          tr.oi = n.state; tr.committed = true; passes.push([t, tr.id]);
          const need = tr.route.sws.find(x => x.sw === n); if (!n.fixed && (!need || need.state !== tr.oi)) tr.onPlan = false;
        }
      }
      for (let i = trains.length - 1; i >= 0; i--) if (trains[i].done) trains.splice(i, 1);
      b.switches.forEach(s => { s.locked = false; });
      for (const tr of trains) if (tr.node.outs.length === 2 && tr.committed) tr.node.locked = true;
      maxC = Math.max(maxC, trains.length);

      // joueur simulé
      if (bot) {
        if (action && t >= action.at) {
          if (action.kind === 'id') action.tr.idd = true;
          else { taps++; if (t > dur - 30) tapsEnd++; if (!action.sw.locked && action.sw.state !== action.state) action.sw.state = action.state; }
          action = null;
        }
        if (!action) {
          const tracked = trains.filter(tr => tr.idd && tr.onPlan && tr.route.sws.some(x => x.din + CA > tr.s));
          let best = null;
          // tâches d'aiguillage : après le passage du train précédent qui l'emprunte, avant l'entrée du train
          for (const tr of tracked) {
            for (const x of tr.route.sws) {
              if (x.din + CA <= tr.s) continue;
              const blocked = trains.some(o => o !== tr && o.born < tr.born && o.onPlan && o.route.sws.some(y => y.sw === x.sw && o.s < y.dout));
              if (blocked) continue;
              if (x.sw.state === x.state) continue;
              if (bot.pLapse) {   // oubli : certaines décisions ne sont jamais prises (trou d'attention)
                if (!tr.lap) tr.lap = new Map();
                // rebasculement serré (fenêtre ≤ 4 s) : oubli plus fréquent, mesuré sur les parties réelles (4,1 % contre 1,4 %)
                if (!tr.lap.has(x.sw)) {
                  const win = (x.din + CA - tr.s) / v;
                  // interférence : les oublis augmentent avec le nombre d'autres décisions à rattraper dans les 4 s (mesuré : ×2 du niveau 8 au niveau 9)
                  let busy = 0;
                  if (bot.gamma) for (const o of trains) { if (o === tr || !o.onPlan) continue; const y = o.route.sws.find(z => z.din + CA > o.s); if (y && (y.din + CA - o.s) / v <= 4 && y.sw.state !== y.state) busy++; }
                  const base = win <= 4 && bot.pRe ? bot.pRe : bot.pLapse;
                  tr.lap.set(x.sw, rng() < base * ((bot.floor ?? 1) + (bot.gamma || 0) * busy));
                }
                if (tr.lap.get(x.sw)) continue;
              }
              const deadline = t + (x.din + CA - tr.s) / v;
              if (t + bot.tAct + (bot.tTrace || 0) > deadline) continue;
              if (!best || deadline < best.deadline) best = { kind: 'sw', sw: x.sw, state: x.state, deadline };
            }
          }
          // identification d'un nouveau train (capacité de suivi K)
          // identification : seulement les trains qu'on peut encore aider (un humain laisse tomber un train perdu)
          if (tracked.length < bot.K) {
            for (const cand of trains) {
              if (cand.idd || cand.s <= 0.2 || !cand.onPlan) continue;
              const cost = tIdOf() + (bot.tTrace || 0);
              const nx = cand.route.sws.find(x => x.din + CA > cand.s + v * (cost + bot.tAct));
              if (!nx) { cand.idd = true; cand.lost = true; continue; }
              const deadline = t + (nx.din + CA - cand.s) / v;
              if (!best || deadline < best.deadline) best = { kind: 'id', tr: cand, deadline };
              break;   // on regarde les trains dans l'ordre d'arrivée
            }
          }
          if (best) {
            const cost = best.kind === 'id' ? tIdOf() : bot.tAct + (bot.tTrace || 0);   // repérer la gare, puis à chaque aiguillage : choisir la voie + taper
            action = Object.assign(best, { at: t + cost * (bot.pErr && rng() < bot.pErr ? 2 : 1) });
          }
        }
      }
      t += dt;
    }
    let simul = 0;
    for (const [pt, id] of passes) if (passes.some(([q, j]) => j !== id && Math.abs(q - pt) <= 0.5)) simul++;
    let minEv = Infinity; const ps = passes.map(p => p[0]).sort((a, c) => a - c); for (let i = 1; i < ps.length; i++) minEv = Math.min(minEv, ps[i] - ps[i - 1]);
    return { ok, ko, prec: ok + ko ? ok / (ok + ko) : 1, maxC, taps, Rend: tapsEnd / 30, simul: passes.length ? simul / passes.length : 0, spawnLog, conflicts, work: workSum / Math.max(1, spawned), trains: ok + ko, blockedFrac: blocked / Math.max(1, blocked + spawned), minEv };
  }

  return { generate, generatePeigne, planifier, metrics, simulate, revealOrder, reveal, visibleView, checkFlow, planSlots, makeSpawner, makeDropper, futureEvents, pickDest, routesOf, makeRng, qpt, qtan, DC, DR, opp };
})();

export default AIG;
export { AIG };
