// Écrans communs d'un jeu (REGLES.md §2) : accueil, modes, niveaux, tutoriel, stats.
// Chaque fonction dessine l'écran dans ctx.app et renvoie, si besoin, une fonction de nettoyage.
import { CATEGORIES, modesDu, nomDuMode, NOM_COMMUN } from '../registre.js';
import { icone } from '../icones.js';
import { stats as statsDe, record, reglages, changerReglage, journal } from '../stockage.js';
import { maximum } from '../score.js';
import { nombre, toast, copier, appuiLong, lancerDecor } from '../ui.js';

const categorie = jeu => CATEGORIES.find(c => c.id === jeu.categorie);
const voile = leger => `<div class="voile${leger ? ' leger' : ''}"></div>`;

// « Jouer » : un seul mode → lancement direct (grille pour Niveaux), sinon choix du mode.
function jouer(ctx) {
  const modes = modesDu(ctx.jeu);
  if (modes.length > 1) return ctx.aller(`#jeu/${ctx.jeu.id}/modes`);
  if (modes[0] === 'niveaux') return ctx.aller(`#jeu/${ctx.jeu.id}/niveaux`);
  ctx.jouer(modes[0], 1);
}

export function accueil(ctx) {
  const { app, jeu } = ctx;
  const c = categorie(jeu);
  const dev = reglages().dev;
  app.innerHTML = `${voile(true)}<section class="ecran">
    <a class="retour-hub" href="#jeux">Brainer</a>
    <div class="carte milieu">
      <div class="pastille"><span>${icone(jeu.categorie)}${c ? c.nom : ''}</span></div>
      <h1 class="titre-jeu">${jeu.nom}</h1>
      ${jeu.accroche ? `<p class="accroche">${jeu.accroche}</p>` : ''}
      <button class="btn principal" data-a="jouer">Jouer</button>
      <button class="btn" data-a="tutoriel">Tutoriel</button>
      <button class="btn" data-a="stats">Stats</button>
      ${dev ? '<p class="mention">Mode développeur actif</p>' : ''}
    </div></section>`;
  appuiLong(app.querySelector('.titre-jeu'), () => {
    const v = !reglages().dev; changerReglage('dev', v);
    toast(v ? 'Mode développeur activé' : 'Mode développeur désactivé'); ctx.rafraichir();
  });
  app.querySelector('.carte').addEventListener('click', e => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'jouer') jouer(ctx);
    else if (a) ctx.aller(`#jeu/${jeu.id}/${a}`);
  });
}

export function modes(ctx) {
  const { app, jeu } = ctx;
  const ligne = m => {
    const r = m === 'niveaux'
      ? Object.entries(statsDe(jeu.id).records).filter(([k]) => k.startsWith('niveaux-')).map(([, x]) => x.score)
      : [record(jeu.id, m)?.score].filter(Boolean);
    const rec = r.length ? nombre(Math.max(...r)) : '';
    const sous = jeu.modes[m].nom ? `<i>${NOM_COMMUN[m]}</i>` : '';
    return `<button class="mode" data-mode="${m}">${rec ? `<span class="rec">${rec}</span>` : ''}<b>${nomDuMode(jeu, m)}</b>${sous}<p>${jeu.modes[m].objectif || ''}</p></button>`;
  };
  app.innerHTML = `${voile()}<section class="ecran"><div class="carte milieu">
    <h2>Jouer</h2><p class="aide">${jeu.nom}</p>
    ${modesDu(jeu).map(ligne).join('')}
    <button class="btn discret" data-retour>Retour</button></div></section>`;
  app.querySelector('.carte').addEventListener('click', e => {
    if (e.target.closest('[data-retour]')) return ctx.aller(`#jeu/${jeu.id}`);
    const m = e.target.closest('[data-mode]')?.dataset.mode;
    if (m === 'niveaux') ctx.aller(`#jeu/${jeu.id}/niveaux`);
    else if (m) ctx.jouer(m, m === 'chrono' ? (jeu.modes.chrono.charge || 10) : 1);
  });
}

export function niveaux(ctx) {
  const { app, jeu } = ctx;
  if (!jeu.modes.niveaux) return ctx.aller(`#jeu/${jeu.id}`);
  const recs = Array.from({ length: 10 }, (_, i) => record(jeu.id, 'niveaux', i + 1));
  const prochain = recs.findIndex(r => !r) + 1;
  app.innerHTML = `${voile()}<section class="ecran"><div class="carte milieu">
    <h2>Niveaux</h2><p class="aide">Une partie parfaite vaut 1 000 × le niveau.</p>
    <div class="grille">${recs.map((r, i) => {
      const n = i + 1, max = 1000 * n;
      return `<button class="niv${n === prochain ? ' prochain' : ''}" data-n="${n}" aria-label="Niveau ${n}"><span class="n">${n}</span>
        <span class="s">${r ? nombre(r.score) : '—'} <small>/ ${nombre(max)}</small></span><span class="barre"><i style="width:${r ? Math.min(100, (r.score / max) * 100) : 0}%"></i></span></button>`;
    }).join('')}</div>
    <button class="btn discret" data-retour>Retour</button></div></section>`;
  app.querySelector('.carte').addEventListener('click', e => {
    if (e.target.closest('[data-retour]')) return ctx.aller(modesDu(jeu).length > 1 ? `#jeu/${jeu.id}/modes` : `#jeu/${jeu.id}`);
    const n = e.target.closest('[data-n]')?.dataset.n;
    if (n) ctx.jouer('niveaux', +n);
  });
}

export function tutoriel(ctx) {
  const { app, jeu } = ctx;
  let k = 0, arret = () => {};
  const cartes = jeu.tutoriel;
  const dessiner = () => {
    arret();
    const t = cartes[k], dernier = k === cartes.length - 1;
    app.innerHTML = `${voile()}<section class="ecran"><div class="carte milieu">
      <div class="illu"><canvas aria-hidden="true"></canvas></div>
      <h2>${t.titre}</h2><p class="aide" style="font-size:16px;line-height:1.45">${t.texte}</p>
      <div class="points" aria-label="Carte ${k + 1} sur ${cartes.length}">${cartes.map((_, i) => `<i class="${i === k ? 'on' : ''}"></i>`).join('')}</div>
      <div class="rangee"><button class="btn discret" data-a="retour">Retour</button><button class="btn principal" data-a="suite">${dernier ? 'Compris' : 'Suivant'}</button></div>
    </div></section>`;
    // Illustration : le jeu peut dessiner chaque carte (t.dessin), sinon son décor sert d'illustration.
    const c = app.querySelector('.illu canvas');
    arret = typeof t.dessin === 'function'
      ? lancerDecor({ id: jeu.id, decor: (cv, o) => t.dessin(cv, o) }, c)
      : lancerDecor(jeu, c);
    app.querySelector('.carte').addEventListener('click', e => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'retour') { if (k) { k--; dessiner() } else ctx.aller(`#jeu/${jeu.id}`) }
      if (a === 'suite') { if (!dernier) { k++; dessiner() } else ctx.aller(`#jeu/${jeu.id}`) }
    });
  };
  dessiner();
  return () => arret();
}

export function stats(ctx) {
  const { app, jeu } = ctx;
  const s = statsDe(jeu.id);
  const r = s.records;
  const dev = reglages().dev;
  const lignesNiv = jeu.modes.niveaux ? Array.from({ length: 10 }, (_, i) => {
    const x = r[`niveaux-${i + 1}`];
    return `<tr><td>${i + 1}</td><td>${x ? x.parties : 0}</td><td>${x ? nombre(x.score) : '—'} <small>/ ${nombre(1000 * (i + 1))}</small></td><td>${x ? x.serie : '—'}</td></tr>`;
  }).join('') : '';
  const autres = modesDu(jeu).filter(m => m !== 'niveaux');
  const lignesModes = autres.map(m => {
    const x = r[m], max = maximum(jeu, m);
    return `<tr><td>${nomDuMode(jeu, m)} <small>${jeu.modes[m].nom ? NOM_COMMUN[m] : ''}</small></td><td>${x ? x.parties : 0}</td>
      <td>${x ? nombre(x.score) : '—'}${max ? ` <small>/ ${nombre(max)}</small>` : ''}</td><td>${m === 'survie' ? (x?.niveau ? `niv. ${x.niveau}` : '—') : (x ? x.serie : '—')}</td></tr>`;
  }).join('');
  // Filtres de la courbe : niveaux joués, puis les autres modes joués.
  const filtres = [
    ...Array.from({ length: 10 }, (_, i) => r[`niveaux-${i + 1}`] ? { cle: `niveaux-${i + 1}`, nom: `Niveau ${i + 1}` } : null).filter(Boolean),
    ...autres.filter(m => r[m]).map(m => ({ cle: m, nom: nomDuMode(jeu, m) }))
  ];
  let actif = filtres[0]?.cle;
  app.innerHTML = `${voile()}<section class="ecran"><div class="carte milieu" style="padding:18px 16px;max-height:100%;display:flex;flex-direction:column">
    <h2>Stats</h2><p class="aide">${jeu.nom}</p><div class="defile" style="margin:0 -16px;padding:0 16px">
    ${lignesNiv ? `<div class="rubrique">Niveaux</div><table><tr><th>Niv.</th><th>Parties</th><th>Record / max</th><th>Série</th></tr>${lignesNiv}</table>` : ''}
    ${lignesModes ? `<div class="rubrique">Modes</div><table><tr><th>Mode</th><th>Parties</th><th>Record</th><th>${autres.includes('survie') ? 'Niveau' : 'Série'}</th></tr>${lignesModes}</table>` : ''}
    <div class="rubrique">Progression</div>
    ${filtres.length ? `<div class="puces">${filtres.map(f => `<button data-f="${f.cle}">${f.nom}</button>`).join('')}</div><svg class="courbe" viewBox="0 0 300 96" preserveAspectRatio="none" aria-label="Courbe de progression"></svg>` : '<p class="vide">Joue une partie pour voir ta courbe.</p>'}
    <p class="mention">Stats enregistrées sur cet appareil, dans ce navigateur.</p>
    ${dev ? `<div class="rubrique">Mode développeur</div><button class="btn" data-a="copier">Copier mes données</button><a class="btn" data-a="envoyer" href="#">Envoyer en test</a>` : ''}
    </div><button class="btn discret" data-a="retour">Retour</button></div></section>`;
  const courbe = () => {
    const svg = app.querySelector('.courbe'); if (!svg) return;
    app.querySelectorAll('[data-f]').forEach(b => b.classList.toggle('on', b.dataset.f === actif));
    const pts = s.parties.filter(p => (p.mode === 'niveaux' ? `niveaux-${p.niveau}` : p.mode) === actif)
      .map(p => (p.max ? p.score / p.max : p.score));
    const haut = Math.max(...pts, actif.startsWith('niveaux') || actif === 'chrono' ? 1 : 1e-9);
    const xy = pts.map((v, i) => `${pts.length > 1 ? (i / (pts.length - 1)) * 292 + 4 : 150},${90 - (v / haut) * 82}`);
    svg.innerHTML = `<polyline points="${xy.join(' ')}" fill="none" stroke="var(--jeu)" stroke-width="3" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`
      + xy.map(p => `<circle cx="${p.split(',')[0]}" cy="${p.split(',')[1]}" r="3" fill="var(--jeu)"/>`).join('');
  };
  courbe();
  // « Envoyer en test » : formulaire d'issue prérempli (REGLES.md §6), adresse limitée à ≈ 6 000 caractères.
  const lien = app.querySelector('[data-a="envoyer"]');
  if (lien) {
    const j = journal(jeu.id);
    let n = j.length, url = '';
    do {
      const donnees = JSON.stringify(j.slice(j.length - n));
      url = `https://github.com/Ryukro/Brainer/issues/new?template=2-retour-de-test.yml&jeu=${encodeURIComponent(`${jeu.nom} ${jeu.version}`)}`
        + `&appareil=${encodeURIComponent(navigator.userAgent.slice(0, 120))}&donnees=${encodeURIComponent((n < j.length ? `(${n} parties les plus récentes sur ${j.length}) ` : '') + donnees)}`;
    } while (url.length > 6000 && --n > 0);
    lien.href = url; lien.target = '_blank'; lien.rel = 'noopener';
  }
  app.querySelector('.carte').addEventListener('click', async e => {
    const f = e.target.closest('[data-f]')?.dataset.f;
    if (f) { actif = f; courbe(); return }
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'retour') ctx.aller(`#jeu/${jeu.id}`);
    if (a === 'copier') toast(await copier(JSON.stringify({ jeu: jeu.id, version: jeu.version, journal: journal(jeu.id), stats: s })) ? 'Données copiées' : 'Copie impossible');
  });
}
