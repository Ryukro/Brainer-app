// Averse — module du jeu pour le hub de Brainer (contrat : REGLES.md §1).
// Porté de archives/averse-v15.html : logique (coeur.js), chute, effets et rendu repris tels quels ;
// menus, bandeau, vies, pause, fin, stats et stockage sont fournis par le cadre du hub.
// La saisie (réponse + pavé) est posée par le jeu dans sa zone, avec les couleurs de la charte.
import { Logic, clamp } from './coeur.js';

const fmtTime = s => s == null ? '–' : s.toFixed(1).replace('.', ',') + ' s';

const STYLE = `
.av-saisie{position:absolute;left:0;right:0;bottom:0;padding:8px 12px max(10px,env(safe-area-inset-bottom));background:var(--bg);border-top:1px solid var(--line)}
.av-reponse{height:46px;border-radius:var(--r);background:var(--panel);border:1.5px solid var(--line);display:grid;place-items:center;font:700 26px var(--font);font-variant-numeric:tabular-nums;margin-bottom:8px;transition:border-color .2s}
.av-reponse.ok{border-color:var(--ok)}.av-reponse.err{border-color:var(--err)}
.av-ph{color:var(--muted);font-weight:500;font-size:17px}
.av-pave{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}
.av-pave button{height:50px;border:0;border-radius:var(--r);background:var(--key);color:var(--text);font:600 24px var(--font);touch-action:manipulation;cursor:pointer}
.av-pave button[data-k=ok]{background:var(--jeu);color:var(--onacc);font-size:20px}
.av-pave button.appui{filter:brightness(1.3)}
@media (min-height:900px){.av-pave button{height:56px}}`;
function poserStyle() {
  if (document.getElementById('averse-style')) return;
  const s = document.createElement('style'); s.id = 'averse-style'; s.textContent = STYLE; document.head.append(s);
}

// Moteur d'une instance dans un canvas : décor de l'accueil ({ demo }) ou partie ({ mode, level, signaler, vibrations }).
function moteur(cv, opts) {
  'use strict';
  const ctx = cv.getContext('2d');
  const DROP_SVG = '<svg viewBox="0 0 18 22"><path d="M9 1 C9 1 2 10 2 14.5 A7 7 0 0 0 16 14.5 C16 10 9 1 9 1Z" fill="#7fc6ff"/></svg>';
  const OP_FONT = '600 18px Fredoka, system-ui, sans-serif';
  const DROP_K = 1.9;   // distance pointe–centre, en rayons

  let W = 0, H = 0, DPR = 1, groundY = 0, COLS = 4;
  // calcul posé : 1er nombre en haut, opérateur + 2e nombre dessous, alignés à droite
  function dropSize(a, sym, b) {
    const bw = Math.max(ctx.measureText(a).width, ctx.measureText(sym).width + 5 + ctx.measureText(b).width);
    return { bw, R: Math.max(28, Math.round(Math.hypot(bw / 2, 19) + 5)) };
  }
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2.5);
    // petit canvas (vignette du hub) : on dessine un écran de 360 px de large, réduit à la taille du canvas
    const K = Math.min(1, cv.clientWidth / 360);
    W = Math.max(1, cv.clientWidth / K); H = Math.max(1, cv.clientHeight / K);
    cv.width = Math.round(cv.clientWidth * DPR); cv.height = Math.round(cv.clientHeight * DPR);
    ctx.setTransform(DPR * K, 0, 0, DPR * K, 0, 0);
    groundY = H - 22;
    // colonnes assez larges pour la plus grosse goutte possible
    ctx.font = OP_FONT;
    const rMax = Math.max(...[['130', '÷', '13'], ['50', '+', '50'], ['50', '−', '50']].map(s => dropSize(...s).R));
    COLS = Math.max(3, Math.floor(W / (2 * rMax + 8)));
    if (S) S.ops.forEach(o => { o.col = Math.min(o.col, COLS - 1); o.x = (W / COLS) * (o.col + 0.5); });
    initRain();
  }
  const rnd = (a, b) => a + Math.random() * (b - a);
  const rint = (a, b) => Math.floor(rnd(a, b + 1));

  // =====================================================================
  //  EFFETS (décor, indépendants de la logique)
  // =====================================================================
  const FX = { particles: [], floaters: [], bolts: [], impacts: [], wind: [], flash: 0, burst: 0, groundHit: 0,
    skyFlash: 0, gust: 0, gustT: 0, boltT: 3, storm: 0, stormy: false };
  let rain = [], windFx = 0;
  function initRain() {
    const n = Math.round(W * H / 6000);
    rain = Array.from({ length: n }, () => ({ x: rnd(0, W), y: rnd(0, H), l: rnd(8, 18), v: rnd(380, 620) }));
  }
  function splash(x, y, gold = false) {
    for (let i = 0; i < 16; i++) {
      const a = rnd(0, Math.PI * 2), v = rnd(80, 260);
      FX.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 80, r: rnd(2, 4.5), life: rnd(0.45, 0.8), gold });
    }
  }
  function groundSplash(o) {
    for (let i = 0; i < 10; i++) FX.particles.push({ x: o.x + rnd(-o.w / 2, o.w / 2), y: groundY, vx: rnd(-60, 60), vy: rnd(-220, -90), r: rnd(2, 4), life: rnd(.4, .7), bad: true });
    FX.impacts.push({ x: o.x, life: 1 }); FX.groundHit = 1;
  }
  function makeBolt(x0, x1, yEnd, bg) {
    const steps = 10, pts = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, jitter = i === 0 || i === steps ? 0 : rnd(-24, 24);
      pts.push([x0 + (x1 - x0) * t + jitter, -10 + (yEnd + 10) * t]);
    }
    const bi = rint(3, 6), dir = Math.random() < 0.5 ? -1 : 1, branch = [pts[bi]];
    for (let j = 1; j <= 3; j++) { const p = branch[j - 1]; branch.push([p[0] + dir * rnd(14, 30), p[1] + rnd(16, 34)]); }
    FX.bolts.push({ pts, branch, life: 0.5, bg });
  }
  // éclair de fond : s'arrête dans le ciel, ne touche pas l'eau
  function skyBolt() { const x0 = rnd(W * 0.1, W * 0.9); makeBolt(x0, clamp(x0 + rnd(-70, 70), 10, W - 10), rnd(H * 0.28, H * 0.55), true); FX.skyFlash = 1; }
  function strike(x) { makeBolt(clamp(x + rnd(-80, 80), 10, W - 10), x, groundY, false); }
  function shakeStage() { try { cv.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(0)' }], { duration: 300 }); } catch (e) { /* non supporté */ } }
  function vibrate(p) { if (!opts.vibrations) return; try { navigator.vibrate && navigator.vibrate(p); } catch (e) { /* non supporté */ } }

  // =====================================================================
  //  PARTIE : contrat init → update → render → score → fin
  // =====================================================================
  let S = null;
  const Game = {
    init(mode, level) {
      const segs = mode === 'niveaux' ? Logic.niveauxSegments(level) : Logic.survieSegments(1, 0, 0);
      const queue = Logic.schedule(segs, Math.random);
      const specials = Logic.specialTimes(mode);
      S = { mode, level: mode === 'survie' ? 1 : level, startLevel: level,
        segs, queue, qi: 0, specials, si: 0, nextSpecial: 30, blockStart: 0, blockClean: true,
        total: mode === 'survie' ? 0 : queue.length + specials.length,   // nombre fixe de gouttes en Niveaux
        makeOp: Logic.createPicker(Math.random),
        t: 0, clock: 0, respite: 0, ops: [], nextId: 1, lastSpawn: -10, lastCols: [],
        lives: mode === 'survie' ? 3 : Infinity, streak: 0, bestStreak: 0, raw: 0, pts: 0,
        correct: 0, errors: 0, cleared: 0, times: [], input: '', playing: true, paused: false, deluge: false, ended: false,
        log: { drops: [], typed: [] } };
      FX.particles = []; FX.floaters = []; FX.bolts = []; FX.impacts = []; FX.wind = [];
      setInput(''); etat();
    },
    segAt(t) { let s = S.segs[0]; for (const g of S.segs) if (g.t0 <= t) s = g; return s; },
    // Une goutte n'apparaît que dans une colonne libre : jamais de chevauchement
    pickColumn(speed) {
      const free = [];
      // marge : traînée + espace ; si la nouvelle goutte est plus rapide, on ajoute ce qu'elle rattrapera avant que l'autre touche le sol
      const gapNeeded = o => 26 + Math.max(0, speed - o.speed) * Math.max(0, groundY - o.y) / o.speed;
      for (let c = 0; c < COLS; c++) if (S.ops.every(o => o.col !== c || o.y - DROP_K * o.R >= gapNeeded(o))) free.push(c);
      if (!free.length) return -1;
      const fresh = free.filter(c => !S.lastCols.includes(c));
      const pool = fresh.length ? fresh : free;
      return pool[rint(0, pool.length - 1)];
    },
    spawn(special, seg) {
      const speed = (groundY + 60) / seg.fall;   // même vitesse pour toutes les gouttes d'une tranche
      const col = this.pickColumn(speed);
      if (col < 0) return false;   // aucune place : la goutte attend
      const op = S.makeOp(seg.level, special);
      ctx.font = OP_FONT;
      const { bw, R } = dropSize(String(op.a), op.sym, String(op.b));
      const w = 2 * R, h = 2 * R, tip = Math.round(R * (DROP_K - 1));
      const cw = W / COLS, slack = Math.max(0, (cw - w) / 2 - 3);
      const x = cw * (col + 0.5) + rnd(-slack, slack);
      S.lastCols = [col, ...S.lastCols].slice(0, 2);
      S.ops.push({ id: S.nextId++, ...op, special, col, x, y: -h / 2, w, h, tip, R, bw, speed, born: S.t, bornClock: S.clock, storm: S.deluge, level: seg.level });
      S.lastSpawn = S.t;
      return true;
    },
    removeDrop(o, outcome) {
      S.log.drops.push([+o.bornClock.toFixed(2), `${o.a}${o.sym}${o.b}`, o.res, +S.clock.toFixed(2), outcome, o.special ? 1 : 0]);
    },
    addPoints(o) {
      const v = Logic.dropValue(S.streak);
      S.raw += v; S.streak += 1; S.bestStreak = Math.max(S.bestStreak, S.streak); S.cleared += 1;
      // Tempête : chaque goutte vaut sa valeur du mode Niveaux au niveau où elle est tombée, cumulée sur la partie
      if (S.mode === 'survie') { const g = v * Logic.unitOf(o.level); S.pts += g; return Math.round(g); }
      return Math.round(this.scale() * v);
    },
    answer(value) {
      let hits = S.ops.filter(o => o.res === value);
      const burst = hits.some(o => o.special);
      if (burst) hits = S.ops.slice();   // la goutte dorée fait éclater tout l'écran
      S.log.typed.push([+S.clock.toFixed(2), value, hits.length ? 1 : 0]);
      if (!hits.length) {
        // erreur de saisie : coût fixe d'une goutte (la série n'est pas touchée)
        S.errors += 1;
        let shown;
        if (S.mode === 'survie') { const lost = Math.min(Logic.ERROR_COST * Logic.unitOf(S.level), S.pts); S.pts -= lost; shown = Math.round(lost); }
        else { const lost = Math.min(Logic.ERROR_COST, S.raw); S.raw -= lost; shown = Math.round(this.scale() * lost); }
        if (shown > 0) FX.floaters.push({ x: W / 2, y: groundY - 30, text: '−' + shown, life: 1, bad: true });
        return { ok: false };
      }
      S.correct += 1;
      for (const o of hits) {
        const gain = this.addPoints(o);
        S.times.push(S.t - o.born);
        this.removeDrop(o, burst ? 'or' : 'ok');
        splash(o.x, o.y, burst);
        FX.floaters.push({ x: o.x, y: o.y, text: '+' + gain, life: 1 });
      }
      S.ops = S.ops.filter(o => !hits.includes(o));
      if (burst) { FX.burst = 1; vibrate([60, 40, 60]); }
      return { ok: true };
    },
    update(dt) {
      S.t += dt;
      if (S.respite > 0) S.respite -= dt;
      else S.clock += dt;   // horloge du jeu, gelée pendant le répit
      // Tempête : à chaque minute, niveau suivant (+2 si aucune goutte au sol, jusqu'au niveau 8), sans fin
      if (S.mode === 'survie' && S.clock >= S.blockStart + Logic.SURVIE_STEP) {
        const from = S.level;
        S.level = Logic.nextSurvieLevel(from, S.blockClean);
        S.blockStart += Logic.SURVIE_STEP; S.blockClean = true;   // les points s'accumulent sur toute la partie
        const segs = Logic.survieSegments(S.level, S.blockStart, from);
        S.segs = S.segs.concat(segs);
        S.queue = S.queue.concat(Logic.schedule(segs, Math.random)).sort((a, b) => a - b);
        opts.signaler('niveau', { niveau: S.level });
      }
      const seg = this.segAt(S.clock);
      const endT = S.mode === 'niveaux' ? Logic.LEVEL_TIME : Infinity;
      const deluge = seg.deluge && S.clock < endT;
      if (deluge && !S.deluge) { FX.gust = 2.5; FX.gustT = rnd(3, 5); skyBolt(); FX.boltT = rnd(1, 2); }
      S.deluge = deluge;

      if (!(S.respite > 0)) {
        const spaced = S.t - S.lastSpawn >= (S.deluge ? Logic.SPACING_DELUGE : Logic.SPACING);
        // goutte dorée : attend l'écart minimal et une colonne libre
        const specialDue = S.specials ? (S.si < S.specials.length && S.specials[S.si] <= S.clock) : S.nextSpecial <= S.clock;
        if (specialDue && spaced && this.spawn(true, seg)) { if (S.specials) S.si++; else S.nextSpecial += Logic.SPECIAL_EVERY; }
        // gouttes du calendrier : nombre fixe, jamais sautées ; elles attendent une place si besoin
        else if (S.qi < S.queue.length && S.queue[S.qi] <= S.clock && S.clock < endT + 60) {
          const cap = Math.round(seg.dens);
          const room = S.ops.filter(o => !o.special).length < cap;
          if (room && spaced && this.spawn(false, seg)) S.qi++;
        }
      }
      for (const o of S.ops) o.y += o.speed * dt;   // vitesse de chute fixe
      const landed = S.ops.filter(o => o.y + o.h / 2 >= groundY);
      if (landed.length) {
        S.ops = S.ops.filter(o => !landed.includes(o));
        landed.forEach(o => { this.removeDrop(o, 'sol'); groundSplash(o); });
        S.streak = 0;
        S.blockClean = false;   // Tempête : pas de saut de niveau après une goutte au sol
        if (S.mode === 'niveaux') {
          // Niveaux, sans vies : la goutte est perdue, retour discret là où elle tombe
          etat();
        } else {
          S.lives -= landed.length;
          landed.forEach(o => strike(o.x));
          FX.flash = 1; vibrate(landed.length > 1 ? [120, 60, 120] : 180); shakeStage();
          landed.forEach(() => opts.signaler('vie'));
          etat();
          if (S.lives <= 0) { this.fin(); return; }
          // l'éclair fait éclater toutes les gouttes restantes : répit de 2 s, sans points
          S.ops.forEach(o => { this.removeDrop(o, 'eclair'); splash(o.x, o.y); });
          S.ops = [];
          S.respite = 2;
        }
      }
      // fins de partie
      if (S.mode === 'niveaux' && S.clock >= Logic.LEVEL_TIME - Logic.DELUGE_NIV && S.qi >= S.queue.length && S.si >= S.specials.length && !S.ops.length) { this.fin(); return; }
    },
    render() { draw(); },
    // Valeur d'un point en Niveaux (1 000 × niveau ÷ points max)
    scale() { return this.max() / Logic.rawMax(S.total); },
    score() {
      if (S.mode === 'survie') return Math.round(S.pts);
      return Math.round(this.scale() * S.raw);
    },
    max() { return S.mode === 'niveaux' ? 1000 * S.level : null; },
    fin() {
      if (S.ended) return;
      S.ended = true; S.playing = false;
      S.ops.forEach(o => this.removeDrop(o, 'fin'));
      finir(this.result());
    },
    result() {
      const att = S.correct + S.errors;
      return { mode: S.mode, level: S.mode === 'niveaux' ? S.level : null, reached: S.level, score: this.score(), max: this.max(),
        prec: att ? S.correct / att : null, bestStreak: S.bestStreak, cleared: S.cleared,
        total: S.mode === 'survie' ? null : S.total,
        avg: S.times.length ? S.times.reduce((a, b) => a + b, 0) / S.times.length : null };
    },
  };
  function updateAmbient(dt) {
    // orage : pendant la rafale, et tant que des gouttes de la rafale sont à l'écran
    const menu = !!opts.demo;
    FX.stormy = menu || !!(S && S.playing && (S.deluge || S.ops.some(o => o.storm)));
    if (menu || (FX.stormy && S.deluge)) { FX.gustT -= dt; if (FX.gustT <= 0) { FX.gust = rnd(1.2, 2); FX.gustT = rnd(3, 5); } }
    // éclairs de fond pendant l'orage, et de temps en temps sur l'accueil
    FX.boltT -= dt;
    if (FX.boltT <= 0) { if (FX.stormy || !S || !S.playing) skyBolt(); FX.boltT = menu ? rnd(1.5, 4) : FX.stormy ? rnd(1.2, 2.6) : rnd(4, 9); }
    FX.storm += ((FX.stormy ? 1 : 0) - FX.storm) * Math.min(1, dt * 2.5);
    const boost = 1 + FX.storm * 0.8;
    windFx = Math.min(1.4, FX.storm * 0.5 + FX.gust * 0.5);
    const slant = 0.12 + windFx * 0.6;
    for (const d of rain) {
      d.y += d.v * dt * boost; d.x -= d.v * dt * slant * boost;
      if (d.y > H || d.x < -30) { d.y = -d.l; d.x = rnd(0, W + H * slant); }
    }
    FX.particles.forEach(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 520 * dt; p.life -= dt; });
    FX.particles = FX.particles.filter(p => p.life > 0);
    FX.floaters.forEach(f => { f.y -= 50 * dt; f.life -= dt * 1.2; });
    FX.floaters = FX.floaters.filter(f => f.life > 0);
    FX.flash = Math.max(0, FX.flash - dt * 2.2);
    FX.burst = Math.max(0, FX.burst - dt * 1.8);
    FX.gust = Math.max(0, FX.gust - dt);
    FX.skyFlash = Math.max(0, FX.skyFlash - dt * 3);
    const windRate = FX.gust > 0 ? 40 : 10 * FX.storm;
    if (Math.random() < dt * windRate) FX.wind.push({ x: W + rnd(0, 60), y: rnd(0, groundY * 0.9), len: rnd(60, 160), v: rnd(700, 1100), life: 1, ph: rnd(0, 6) });
    FX.wind.forEach(w => { w.x -= w.v * dt; w.life -= dt * 0.9; });
    FX.wind = FX.wind.filter(w => w.life > 0 && w.x + w.len > -20);
    FX.groundHit = Math.max(0, FX.groundHit - dt * 0.8);
    FX.bolts.forEach(b => { b.life -= dt; });
    FX.bolts = FX.bolts.filter(b => b.life > 0);
    FX.impacts.forEach(i => { i.life -= dt * 0.7; });
    FX.impacts = FX.impacts.filter(i => i.life > 0);
  }

  // =====================================================================
  //  RENDU
  // =====================================================================
  // Forme de goutte : pointe en haut, ventre arrondi en bas
  function dropPath(x, y, R) {
    const d = R * DROP_K, tipY = y - d, beta = Math.acos(1 / DROP_K);
    const a1 = -Math.PI / 2 + beta, a2 = -Math.PI / 2 - beta;
    const t1x = x + R * Math.cos(a1), t2x = x + R * Math.cos(a2), ty = y + R * Math.sin(a1);
    const cy2 = ty + (tipY - ty) * 0.35;
    ctx.beginPath();
    ctx.moveTo(x, tipY);
    ctx.bezierCurveTo(x + R * 0.06, tipY + d * 0.3, t1x + (x - t1x) * 0.35, cy2, t1x, ty);
    ctx.arc(x, y, R, a1, a2 + Math.PI * 2);
    ctx.bezierCurveTo(t2x + (x - t2x) * 0.35, cy2, x - R * 0.06, tipY + d * 0.3, x, tipY);
    ctx.closePath();
  }
  function draw() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0a1322'); g.addColorStop(1, '#1c2d49');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const dfx = FX.storm;
    if (dfx > 0.01) { ctx.fillStyle = `rgba(2,4,12,${dfx * 0.3})`; ctx.fillRect(0, 0, W, H); }
    if (FX.skyFlash > 0) { ctx.fillStyle = `rgba(200,215,255,${FX.skyFlash * 0.12})`; ctx.fillRect(0, 0, W, groundY); }
    // nuages
    ctx.fillStyle = 'rgba(120,145,180,0.08)';
    for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.ellipse((i * 0.21 + 0.05) * W, 8 + (i % 2) * 10, W * 0.16, 26, 0, 0, Math.PI * 2); ctx.fill(); }
    // pluie
    ctx.strokeStyle = `rgba(170,205,240,${0.16 + dfx * 0.22})`; ctx.lineWidth = 1 + dfx * 0.6;
    ctx.beginPath();
    const sl = 0.12 + windFx * 0.6; for (const d of rain) { ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - d.l * sl, d.y + d.l); }
    ctx.stroke();
    // rafales de vent
    for (const w of FX.wind) {
      ctx.strokeStyle = `rgba(210,225,245,${0.22 * clamp(w.life, 0, 1)})`; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(w.x, w.y);
      ctx.quadraticCurveTo(w.x + w.len * 0.5, w.y - 6 * Math.sin(w.ph), w.x + w.len, w.y + 3);
      ctx.stroke();
    }
    // éclairs (en fond, derrière les gouttes)
    for (const b of FX.bolts) {
      const a = clamp(b.life / 0.3, 0, 1) * (Math.random() < 0.2 ? 0.45 : 1) * (b.bg ? 0.55 : 1);
      const path = pts => { ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); };
      ctx.save(); ctx.globalAlpha = a; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.shadowColor = 'rgba(160,200,255,0.95)'; ctx.shadowBlur = 26;
      ctx.strokeStyle = 'rgba(180,210,255,0.5)'; ctx.lineWidth = 8; path(b.pts); ctx.stroke();
      ctx.strokeStyle = '#f4f8ff'; ctx.lineWidth = 2.6; path(b.pts); ctx.stroke();
      ctx.lineWidth = 1.4; path(b.branch); ctx.stroke();
      ctx.restore();
    }
    // sol (flaque)
    const hit = FX.groundHit;
    ctx.fillStyle = hit > 0 ? `rgba(255,122,89,${0.15 + hit * 0.35})` : 'rgba(95,196,255,0.12)';
    ctx.fillRect(0, groundY, W, H - groundY);
    ctx.strokeStyle = hit > 0 ? `rgba(255,122,89,${0.5 + hit * 0.5})` : 'rgba(127,198,255,0.55)';
    ctx.lineWidth = 2; ctx.beginPath();
    const now = performance.now(), tt = now / 600;
    for (let x = 0; x <= W; x += 4) {
      let wave = 0;
      for (const i of FX.impacts) wave += Math.sin((x - i.x) / 9 - now / 70) * 9 * i.life * Math.exp(-Math.abs(x - i.x) / 90);
      const y = groundY + Math.sin(x / 22 + tt) * 1.6 + wave;
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();

    // gouttes
    if (S) {
      ctx.font = OP_FONT; ctx.textBaseline = 'middle';
      for (const o of S.ops) {
        const danger = clamp((o.y - groundY * 0.55) / (groundY * 0.45), 0, 1);
        ctx.strokeStyle = 'rgba(190,225,255,0.25)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(o.x, o.y - o.h / 2 - o.tip - 2); ctx.lineTo(o.x, o.y - o.h / 2 - o.tip - 14); ctx.stroke();
        dropPath(o.x, o.y, o.R);
        if (o.special) {
          ctx.fillStyle = '#ffd66b';
          ctx.shadowColor = 'rgba(255,190,60,0.85)'; ctx.shadowBlur = 18 + Math.sin(now / 160) * 7;
        } else {
          const r = Math.round(207 + 48 * danger), gg = Math.round(233 - 37 * danger), b = Math.round(255 - 85 * danger);
          ctx.fillStyle = `rgb(${r},${gg},${b})`;
          ctx.shadowColor = danger > 0.5 ? 'rgba(255,122,89,0.6)' : 'rgba(127,198,255,0.45)'; ctx.shadowBlur = 14;
        }
        ctx.fill(); ctx.shadowBlur = 0;
        ctx.lineWidth = 2; ctx.strokeStyle = o.special ? (danger > 0.5 ? '#ff7a59' : '#ffae2e') : danger > 0.5 ? '#ff9d7f' : '#7fb8ec'; ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.beginPath(); ctx.ellipse(o.x - o.R * 0.62, o.y - o.R * 0.5, 5, 2.8, -0.9, 0, Math.PI * 2); ctx.fill();
        const xr = o.x + o.bw / 2, xl = o.x - o.bw / 2;
        ctx.fillStyle = '#0b1a2e'; ctx.textAlign = 'right';
        ctx.fillText(String(o.a), xr, o.y - 9);
        ctx.fillText(String(o.b), xr, o.y + 12);
        ctx.textAlign = 'left'; ctx.fillText(o.sym, xl, o.y + 1.5);   // opérateur centré entre les 2 nombres
        ctx.textAlign = 'center';
        if (o.special) { ctx.font = '700 13px Fredoka, system-ui, sans-serif'; ctx.fillStyle = '#9a5b00'; ctx.fillText('★', o.x, o.y - o.R * 1.2); ctx.font = OP_FONT; }
      }
    }
    // particules
    for (const p of FX.particles) {
      ctx.globalAlpha = clamp(p.life * 1.6, 0, 1);
      ctx.fillStyle = p.bad ? '#ff9d7f' : p.gold ? '#ffd66b' : '#bfe3ff';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // points gagnés
    ctx.font = '700 20px Fredoka, system-ui, sans-serif'; ctx.textAlign = 'center';
    for (const f of FX.floaters) { ctx.globalAlpha = clamp(f.life, 0, 1); ctx.fillStyle = f.bad ? '#ff9d7f' : '#6be3a4'; ctx.fillText(f.text, f.x, f.y - 26); }
    ctx.globalAlpha = 1;
    // flash de perte de vie, éclat doré
    if (FX.flash > 0) { ctx.fillStyle = `rgba(230,240,255,${FX.flash * 0.14})`; ctx.fillRect(0, 0, W, H); }
    if (FX.burst > 0) { ctx.fillStyle = `rgba(255,214,107,${FX.burst * 0.25})`; ctx.fillRect(0, 0, W, H); }
  }



  // ---------- Saisie (réponse + pavé), bandeau et fin : liaison avec le cadre ----------
  let elAnswer = null, saisie = null;
  function setInput(v) {
    if (S) S.input = v;
    if (elAnswer) elAnswer.innerHTML = v ? v : '<span class="av-ph">Ta réponse</span>';
  }
  function flashAnswer(cls) {
    if (!elAnswer) return;
    elAnswer.classList.remove('ok', 'err'); void elAnswer.offsetWidth; elAnswer.classList.add(cls);
    clearTimeout(flashAnswer.t); flashAnswer.t = setTimeout(() => elAnswer.classList.remove(cls), 350);
  }
  // score et série font foi dans le bandeau du hub (une erreur de saisie coûte des points sans casser la série)
  const etat = (type = 'etat') => { if (S && opts.signaler) opts.signaler(type, { score: Game.score(), serie: S.streak }); };
  function press(k) {
    if (!S || !S.playing || S.paused) return;
    if (k === 'del') setInput(S.input.slice(0, -1));
    else if (k === 'ok') {
      if (!S.input) return;
      const r = Game.answer(parseInt(S.input, 10));
      flashAnswer(r.ok ? 'ok' : 'err');
      etat(r.ok ? 'reussite' : 'erreur');
      setInput('');
    }
    else if (/^[0-9]$/.test(k) && S.input.length < 4) setInput(S.input === '0' ? k : S.input + k);
  }
  let lastSec = -1;
  function temps() {
    if (!S || S.mode !== 'niveaux') return;
    const rest = Math.max(0, Logic.LEVEL_TIME - S.clock), sec = Math.ceil(rest);
    if (sec !== lastSec) { lastSec = sec; opts.signaler('temps', { restant: rest * 1000, total: Logic.LEVEL_TIME * 1000 }); }
  }
  function finir(res) {
    etat();
    opts.signaler('fin', {
      stats: [{ nom: 'Gouttes éclatées', valeur: res.total != null ? `${res.cleared} / ${res.total}` : String(res.cleared) },
              { nom: 'Temps moyen', valeur: fmtTime(res.avg) }],
      journal: { v: 'v16', reached: res.reached, drops: S.log.drops, typed: S.log.typed }
    });
  }
  const surTouche = e => {
    if (!S || !S.playing || S.paused) return;
    if (/^[0-9]$/.test(e.key)) { press(e.key); e.preventDefault(); }
    else if (e.key === 'Backspace' || e.key === 'Delete') { press('del'); e.preventDefault(); }
    else if (e.key === 'Enter') { press('ok'); e.preventDefault(); }
  };
  if (!opts.demo) {
    poserStyle();
    saisie = document.createElement('div');
    saisie.className = 'av-saisie';
    saisie.innerHTML = `<div class="av-reponse" aria-live="polite"></div><div class="av-pave">${['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok']
      .map(k => `<button data-k="${k}" ${k === 'del' ? 'aria-label="Effacer"' : ''}>${k === 'del' ? '⌫' : k === 'ok' ? 'OK' : k}</button>`).join('')}</div>`;
    cv.parentElement.append(saisie);
    elAnswer = saisie.querySelector('.av-reponse');
    saisie.querySelectorAll('.av-pave button').forEach(b => b.addEventListener('pointerdown', e => {
      e.preventDefault(); press(b.dataset.k);
      b.classList.add('appui'); setTimeout(() => b.classList.remove('appui'), 110);
    }));
    cv.style.height = `calc(100% - ${saisie.offsetHeight}px)`;
    addEventListener('keydown', surTouche);
  }
  let raf = 0, last = 0;
  function frame(ts) {
    const dt = Math.min(0.05, (ts - last) / 1000 || 0); last = ts;
    if (S && S.demo) demo(dt);
    else if (S && S.playing && !S.paused) { Game.update(dt); if (S && S.playing) temps(); }
    if (!(S && S.paused)) updateAmbient(dt);
    draw();
    raf = requestAnimationFrame(frame);
  }
  resize();
  if (!opts.demo) Game.init(opts.mode, opts.level);
  // décor (accueil, vignette du hub) : quelques gouttes de calcul tombent ; certaines éclatent en l'air
  else S = { demo: true, playing: false, paused: false, ops: [], input: '', t: 0, clock: 0, lastSpawn: -10, lastCols: [], nextId: 1, deluge: false,
    next: 0.3, makeOp: Logic.createPicker(Math.random), log: { drops: [] } };
  function demo(dt) {
    S.t += dt; S.clock += dt; S.next -= dt; S.log.drops.length = 0;
    if (S.next <= 0) { if (S.ops.length < 5) Game.spawn(Math.random() < 0.1, { level: 3, fall: 7 }); S.next = rnd(0.6, 1.2); }
    for (const o of S.ops) o.y += o.speed * dt;
    const pop = S.ops.find(o => o.y > groundY * 0.55 && Math.random() < dt * 0.2);
    if (pop) { splash(pop.x, pop.y, pop.special); FX.floaters.push({ x: pop.x, y: pop.y, text: '+' + (pop.special ? 5 : 1), life: 1 }); }
    const sol = S.ops.filter(o => o.y + o.h / 2 >= groundY);
    sol.forEach(o => groundSplash(o));
    S.ops = S.ops.filter(o => o !== pop && !sol.includes(o));
  }
  raf = requestAnimationFrame(frame);
  return {
    pause() { if (S) S.paused = true; },
    reprendre() { if (S) { S.paused = false; last = performance.now(); } },
    terminer() { if (S && !S.ended) Game.fin(); },   // fin demandée par le cadre (3 gouttes au sol en Tempête)
    arreter() {
      cancelAnimationFrame(raf); removeEventListener('keydown', surTouche);
      if (S) S.playing = false;
      saisie?.remove(); cv.style.height = '';
    },
    redimensionner() { if (saisie) cv.style.height = `calc(100% - ${saisie.offsetHeight}px)`; resize(); }
  };
}

// ---------- Tutoriel : les 3 cartes illustrées du prototype ----------
const dropSvg = (cx, cy, r, a, sym, b, gold) => {
  const d = r * 1.9;
  return `<path d="M ${cx} ${cy - d} C ${cx + r * .1} ${cy - d * .7}, ${cx + r} ${cy - r * .9}, ${cx + r} ${cy} A ${r} ${r} 0 1 1 ${cx - r} ${cy} C ${cx - r} ${cy - r * .9}, ${cx - r * .1} ${cy - d * .7}, ${cx} ${cy - d} Z"
    fill="${gold ? '#ffd66b' : '#cfe9ff'}" stroke="${gold ? '#ffae2e' : '#7fb8ec'}" stroke-width="2"/>
    <text x="${cx + 15}" y="${cy - 6}" text-anchor="end" font-size="16" font-weight="600" fill="#0b1a2e">${a}</text>
    <text x="${cx - 17}" y="${cy + 6}" font-size="16" font-weight="600" fill="#0b1a2e">${sym}</text>
    <text x="${cx + 15}" y="${cy + 16}" text-anchor="end" font-size="16" font-weight="600" fill="#0b1a2e">${b}</text>
    ${gold ? `<text x="${cx}" y="${cy - r * 1.2}" text-anchor="middle" font-size="12" fill="#9a5b00">★</text>` : ''}`;
};
const TUTO = [
  { t: 'Résous les gouttes', x: 'Chaque goutte porte un calcul. Tape le résultat sur le pavé, puis <b>OK</b> : la goutte éclate.',
    s: `<svg viewBox="0 0 300 150">${dropSvg(95, 92, 30, 7, '×', 8)}
      <rect x="170" y="62" width="96" height="44" rx="12" fill="#0f1d33" stroke="#6be3a4" stroke-width="2"/>
      <text x="218" y="92" text-anchor="middle" font-size="26" font-weight="700" fill="#e8f1fb">56</text>
      <path d="M 140 84 L 162 84" stroke="#8ea3bf" stroke-width="2" marker-end="url(#ar)"/>
      <defs><marker id="ar" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="#8ea3bf"/></marker></defs></svg>` },
  { t: 'Un résultat, toutes ses gouttes', x: 'Toutes les gouttes qui donnent ce résultat éclatent ensemble. Après <b>10 gouttes d\'affilée</b>, chaque goutte compte double. Une erreur coûte le prix d\'une goutte.',
    s: `<svg viewBox="0 0 300 150">${dropSvg(70, 90, 30, 3, '×', 4)}${dropSvg(150, 100, 30, 6, '+', 6)}
      <rect x="200" y="70" width="80" height="44" rx="12" fill="#0f1d33" stroke="#6be3a4" stroke-width="2"/>
      <text x="240" y="100" text-anchor="middle" font-size="26" font-weight="700" fill="#e8f1fb">12</text></svg>` },
  { t: 'Ne les laisse pas tomber', x: 'Une goutte au sol casse la série ; en Tempête, <b>3 gouttes au sol</b> et c\'est fini. La <b>goutte dorée ★</b> fait éclater tout l\'écran. Chaque niveau s\'achève par une rafale.',
    s: `<svg viewBox="0 0 300 150">${dropSvg(90, 82, 30, 9, '×', 6, true)}
      <path d="M 0 132 Q 75 126 150 132 T 300 132 L 300 150 L 0 150 Z" fill="rgba(255,122,89,0.3)"/>
      <path d="M 0 132 Q 75 126 150 132 T 300 132" stroke="#ff9d7f" stroke-width="2" fill="none"/>
      <path d="M 225 10 L 210 60 L 228 60 L 214 128" stroke="#f4f8ff" stroke-width="3" fill="none" stroke-linejoin="round"/>
      ${[0, 1, 2].map(i => `<path transform="translate(${180 + i * 26},86)" d="M9 1 C9 1 2 10 2 14.5 A7 7 0 0 0 16 14.5 C16 10 9 1 9 1Z" fill="#7fc6ff" opacity="${i === 2 ? .25 : 1}"/>`).join('')}</svg>` },
];
function illustration(svg) {
  return cv => {
    const c = cv.getContext('2d'), img = new Image();
    img.onload = () => {
      const k = Math.min(cv.width / 300, cv.height / 150), w = 300 * k, h = 150 * k;
      c.clearRect(0, 0, cv.width, cv.height);
      c.drawImage(img, (cv.width - w) / 2, (cv.height - h) / 2, w, h);
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" font-family="Fredoka, system-ui, sans-serif" ')
      .replace(/<b>|<\/b>/g, ''));
    return { arreter() {} };
  };
}

// ---------- Reprise des stats du prototype (clé v1) au format du hub ----------
function importer() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem('brainer.averse.stats.v1')); } catch (e) { /* stockage indisponible */ }
  if (!s) return null;
  const records = {};
  (s.levels || []).forEach((r, i) => { if (r && r.games) records[`niveaux-${i + 1}`] = { parties: r.games, score: r.best || 0, serie: r.bestSerie || 0, niveau: 0 }; });
  const sv = s.survie || s.mort;
  if (sv && sv.games) records.survie = { parties: sv.games, score: sv.best || 0, serie: sv.bestSerie || 0, niveau: sv.bestLevel || 0 };
  const parties = (s.history || []).filter(e => e.mode === 'niveaux' || e.mode === 'survie' || e.mode === 'mort').map(e => {
    const sur = e.mode !== 'niveaux';
    return { date: new Date(e.d).toISOString(), version: 'v15', mode: sur ? 'survie' : 'niveaux', niveau: sur ? 1 : e.level, score: e.score,
      max: sur ? null : e.max, precision: e.prec == null ? 0 : Math.round(e.prec * 1000) / 1000, serie: 0, niveauAtteint: sur ? e.reached : null };
  });
  return { parties, records };
}

const nGouttes = L => Logic.schedule(Logic.niveauxSegments(L), () => 0.5).length + Logic.specialTimes('niveaux').length;

export default {
  id: 'averse',
  nom: 'Averse',
  categorie: 'num',
  version: 'v16',
  accroche: 'Les calculs tombent du ciel. Résous-les avant qu’ils touchent le sol.',
  couleur: { nuit: '#5fc4ff', jour: '#1d64b5', contraste: '#56b4e9' },
  vie: '<path d="M12 2.5S5.5 10 5.5 14.5a6.5 6.5 0 0 0 13 0C18.5 10 12 2.5 12 2.5z"/>',
  tutoriel: TUTO.map(c => ({ titre: c.t, texte: c.x, dessin: illustration(c.s) })),
  modes: {
    niveaux: { objectif: 'Maîtrises-tu ce niveau ? 2 min, dont une rafale finale.' },
    survie: { nom: 'Tempête', objectif: 'Jusqu’où tiendras-tu dans un orage sans fin ? 3 gouttes au sol et c’est fini.' }
  },
  niveaux: Array.from({ length: 10 }, (_, i) => ({ niveau: i + 1, seuil: nGouttes(i + 1) })),
  importer,
  decor(canvas) { return moteur(canvas, { demo: true }); },
  partie({ canvas, mode, niveau, signaler, vibrations }) { return moteur(canvas, { mode, level: niveau, signaler, vibrations }); }
};
