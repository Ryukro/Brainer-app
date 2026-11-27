// Partie, pause et fin (REGLES.md §2, §3, §5). Le cadre tient le bandeau, le minuteur de 2 minutes,
// les vies, la série, le score, la pause et la fin ; le jeu dessine sa zone et signale ce qui s'y passe :
//   signaler('reussite', { niveau?, points? })   points calculés par le cadre si absents (§5)
//   signaler('erreur')                           casse la série, compte dans la précision
//   signaler('vie')                              Survie : une vie perdue
//   signaler('niveau', { niveau })               Survie : niveau atteint
//   signaler('evenement', { … })                 noté au journal (calibrage)
//   signaler('bonus', { points })               points sans réussite (ex. palier sans raté)
//   signaler('etat', { score, serie })          le jeu tient son propre score : tout signal peut porter score et serie, qui font foi
//   signaler('temps', { restant, total })       le jeu tient son propre temps (ms) : le minuteur du cadre s'efface
//   signaler('fin', { stats: [{ nom, valeur }, { nom, valeur }], journal? })   le jeu a fini (après terminer())
import { modesDu, nomDuMode, NOM_COMMUN } from '../registre.js';
import { vies as dessinVies } from '../icones.js';
import { enregistrer, ajouterAuJournal, reglages } from '../stockage.js';
import { valeur, maximum, precision } from '../score.js';
import { nombre, pourcent, dimensionner } from '../ui.js';

const DUREE = 120000;   // Niveaux et Chrono : 2 minutes de jeu
const VIES = 3;         // Survie : 3 vies par défaut

const minutes = ms => { const s = Math.ceil(Math.max(0, ms) / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` };

export function lancerPartie(ctx, mode, niveau) {
  const { app, jeu } = ctx;
  const survie = mode === 'survie';
  const etape = (survie && jeu.modes.survie.etape) || 'Niveau';
  const st = { score: 0, serie: 0, meilleure: 0, reussites: 0, erreurs: 0, vies: VIES, restant: DUREE,
    niveau, atteint: niveau, total: DUREE, tempsJeu: false, pause: false, finie: false, terminee: false, debut: Date.now(), evts: [] };

  app.innerHTML = `<section class="ecran partie">
    <header class="bandeau">
      <div><small>Score</small><b data-v="score">0</b></div>
      <div><small>Série</small><b data-v="serie">0</b></div>
      ${survie ? `<div><small>${etape}</small><b data-v="niveau">${niveau}</b></div><div><small>Vies</small><span class="vies" data-v="vies"></span></div>`
               : `<div><small>Temps</small><b data-v="temps">${minutes(DUREE)}</b></div>`}
      <button class="pause" aria-label="Pause"></button>
      ${survie ? '' : '<div class="temps"><i style="width:100%"></i></div>'}
    </header>
    <div class="zone"><canvas aria-label="Zone de jeu"></canvas></div>
  </section>`;
  const el = k => app.querySelector(`[data-v="${k}"]`);
  const ecran = app.querySelector('.partie');
  const canvas = app.querySelector('.zone canvas');
  const barre = app.querySelector('.temps i');

  const majBandeau = () => {
    el('score').textContent = nombre(st.score);
    el('serie').textContent = st.serie;
    if (survie) { el('vies').innerHTML = dessinVies(jeu, st.vies, VIES); el('vies').setAttribute('aria-label', `${st.vies} vies sur ${VIES}`); el('niveau').textContent = st.atteint }
    else { el('temps').textContent = minutes(st.restant); barre.style.width = `${(st.restant / st.total) * 100}%` }
  };

  const noter = (type, d) => { if (st.evts.length < 600) st.evts.push({ t: Date.now() - st.debut, type, ...d }) };

  // --- signaux du jeu ---
  const signaler = (type, d = {}) => {
    if (st.finie) return;
    noter(type, d);
    if (type === 'temps' || type === 'etat') { if (st.evts.length) st.evts.pop() }
    if (type === 'reussite') {
      const L = d.niveau ?? st.atteint;
      st.score += d.points ?? valeur(jeu, L);
      st.serie++; st.meilleure = Math.max(st.meilleure, st.serie); st.reussites++;
    } else if (type === 'erreur') {
      st.serie = 0; st.erreurs++;
      if (reglages().vibrations) try { navigator.vibrate?.(60) } catch (e) {}
    } else if (type === 'vie' && survie) {
      st.vies = Math.max(0, st.vies - 1);
      if (st.vies === 0) terminer();
    } else if (type === 'bonus') {
      st.score += d.points || 0;
    } else if (type === 'temps') {
      st.tempsJeu = true; st.restant = d.restant; if (d.total) st.total = d.total;
    } else if (type === 'niveau') {
      st.atteint = Math.max(st.atteint, d.niveau);
    }
    if (typeof d.score === 'number') st.score = d.score;
    if (typeof d.serie === 'number') { st.serie = d.serie; st.meilleure = Math.max(st.meilleure, d.serie) }
    if (type === 'fin') return finir(d.stats || [], d.journal);
    majBandeau();
  };

  dimensionner(canvas);
  let partie;
  try {
    partie = jeu.partie({ canvas, mode, niveau, dpr: canvas.width / Math.max(1, canvas.clientWidth), signaler,
      daltonisme: reglages().daltonisme, vibrations: reglages().vibrations });
  } catch (e) { console.error(`[${jeu.id}] partie :`, e); partie = {} }
  majBandeau();

  // --- minuteur (Niveaux, Chrono), compté seulement hors pause ---
  let derniere = performance.now(), raf = 0, secours = 0;
  const boucle = t => {
    const dt = Math.min(250, t - derniere); derniere = t;
    if (!st.pause && !survie && !st.terminee && !st.tempsJeu) {
      st.restant -= dt;
      if (st.restant <= 0) { st.restant = 0; terminer() }
      majBandeau();
    }
    raf = requestAnimationFrame(boucle);
  };
  raf = requestAnimationFrame(boucle);

  // Fin demandée par le cadre (temps écoulé, plus de vie) : le jeu peut finir l'action en cours, puis signale « fin ».
  function terminer() {
    if (st.terminee) return;
    st.terminee = true;
    try { partie.terminer?.() } catch (e) { console.error(e) }
    secours = setTimeout(() => finir([]), 8000);
  }

  // --- pause : bouton, Échap, passage en arrière-plan ---
  const mettrePause = () => {
    if (st.pause || st.finie) return;
    st.pause = true;
    try { partie.pause?.() } catch (e) {}
    const p = document.createElement('div');
    p.className = 'recouvre'; p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', 'Pause');
    p.innerHTML = `<div class="carte milieu"><h2>Pause</h2><p class="aide">${jeu.nom}</p>
      <button class="btn principal" data-a="reprendre">Reprendre</button><button class="btn discret" data-a="abandonner">Abandonner</button>
      <p class="mention">Une partie abandonnée n’est pas comptée.</p></div>`;
    p.addEventListener('click', e => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'reprendre') { p.remove(); st.pause = false; derniere = performance.now(); try { partie.reprendre?.() } catch (er) {} }
      if (a === 'abandonner') { nettoyer(); ctx.aller(`#jeu/${jeu.id}`) }
    });
    ecran.append(p);
    p.querySelector('[data-a="reprendre"]').focus();
  };
  app.querySelector('.bandeau .pause').addEventListener('click', mettrePause);
  const surTouche = e => { if (e.key === 'Escape') { const p = ecran.querySelector('.recouvre [data-a="reprendre"]'); p ? p.click() : mettrePause() } };
  const surVisibilite = () => { if (document.hidden) mettrePause() };
  const surResize = () => { dimensionner(canvas); try { partie.redimensionner?.() } catch (e) {} };
  addEventListener('keydown', surTouche);
  document.addEventListener('visibilitychange', surVisibilite);
  addEventListener('resize', surResize);

  // --- fin de partie ---
  function finir(statsJeu, journalJeu) {
    if (st.finie) return;
    st.finie = true;
    clearTimeout(secours);
    try { partie.arreter?.() } catch (e) {}
    const max = maximum(jeu, mode, niveau);
    const prec = precision(st.reussites, st.erreurs);
    const p = { date: new Date().toISOString(), version: jeu.version, mode, niveau, score: Math.round(st.score), max,
      precision: Math.round(prec * 1000) / 1000, serie: st.meilleure, niveauAtteint: survie ? st.atteint : null };
    const { nouveauRecord } = enregistrer(jeu.id, p);
    ajouterAuJournal(jeu.id, { ...p, stats: statsJeu, evenements: st.evts, ...(journalJeu ? { jeu: journalJeu } : {}) });
    const sous = mode === 'niveaux' ? `Niveaux · niveau ${niveau}`
      : `${nomDuMode(jeu, mode)}${jeu.modes[mode].nom ? ` · ${NOM_COMMUN[mode]}` : ''}${survie ? ` · ${etape.toLowerCase()} ${st.atteint} atteint` : ''}`;
    const chiffres = [[pourcent(prec), 'Précision'], [st.meilleure, 'Meilleure série'], ...statsJeu.slice(0, 2).map(s => [s.valeur, s.nom])];
    const f = document.createElement('div');
    f.className = 'recouvre'; f.setAttribute('role', 'dialog'); f.setAttribute('aria-label', 'Fin de partie');
    f.innerHTML = `<div class="carte milieu"><h2>Fin de partie</h2><p class="aide">${sous}</p>
      <div class="score">${nombre(st.score)}${max ? ` <small>/ ${nombre(max)}</small>` : ''}</div>
      ${nouveauRecord ? '<div class="record"><span>★ Nouveau record</span></div>' : ''}
      <div class="chiffres">${chiffres.map(([v, n]) => `<div><b></b><small></small></div>`).join('')}</div>
      <button class="btn principal" data-a="rejouer">Rejouer</button>
      <div class="rangee"><button class="btn discret" data-a="changer">Changer</button><button class="btn discret" data-a="accueil">Accueil</button></div></div>`;
    f.querySelectorAll('.chiffres div').forEach((d, i) => { d.querySelector('b').textContent = chiffres[i][0]; d.querySelector('small').textContent = chiffres[i][1] });
    f.addEventListener('click', e => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'rejouer') ctx.jouer(mode, niveau);
      if (a === 'changer') ctx.aller(mode === 'niveaux' ? `#jeu/${jeu.id}/niveaux` : (modesDu(jeu).length > 1 ? `#jeu/${jeu.id}/modes` : `#jeu/${jeu.id}`));
      if (a === 'accueil') ctx.aller(`#jeu/${jeu.id}`);
    });
    ecran.querySelector('.recouvre')?.remove();
    ecran.append(f);
    f.querySelector('[data-a="rejouer"]').focus();
  }

  function nettoyer() {
    st.finie = true;
    cancelAnimationFrame(raf); clearTimeout(secours);
    removeEventListener('keydown', surTouche);
    document.removeEventListener('visibilitychange', surVisibilite);
    removeEventListener('resize', surResize);
    try { partie.arreter?.() } catch (e) {}
  }
  return nettoyer;
}
