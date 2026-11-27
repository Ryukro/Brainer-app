// Onglets du hub : Jeux, Stats, Réglages (REGLES.md §7, maquette, planche Hub).
import { CATEGORIES, modesDu, nomDuMode } from '../registre.js';
import { icone } from '../icones.js';
import { stats as statsDe, reglages as lireReglages, changerReglage, toutesLesDonnees, effacerTout } from '../stockage.js';
import { nombre, lancerDecor, toast, confirmer, copier } from '../ui.js';
import { VERSION_HUB } from '../version.js';
import { rechercherMaj, versionPubliee } from '../maj.js';

const APPARENCES = [['nuit', 'Nuit'], ['jour', 'Jour'], ['contraste', 'Contraste']];
const couleur = jeu => jeu.couleur[lireReglages().apparence] || jeu.couleur.nuit;

const onglets = actif => `<nav class="onglets" aria-label="Menu du hub">${[['jeux', 'jeux', 'Jeux'], ['stats', 'stats', 'Stats'], ['reglages', 'reglages', 'Réglages']]
  .map(([h, i, n]) => `<a href="#${h}" class="${h === actif ? 'on' : ''}" ${h === actif ? 'aria-current="page"' : ''}>${icone(i)}${n}</a>`).join('')}</nav>`;

// Meilleur record à afficher sur la tuile d'un jeu.
function resume(jeu) {
  const r = statsDe(jeu.id).records;
  const meilleurs = Object.values(r).map(x => x.score);
  return meilleurs.length ? `Record ${nombre(Math.max(...meilleurs))}` : 'Jamais joué';
}

export function jeux({ app, jeux }) {
  const pastille = jeux.length ? `background:conic-gradient(${jeux.map((j, i) => `${couleur(j)} 0 ${((i + 1) * 360) / jeux.length}deg`).join(',')})` : 'background:var(--muted)';
  app.innerHTML = `<section class="ecran hub">
    <div class="hub-tete"><h1 class="marque">Brainer<span style="${pastille}"></span></h1></div>
    <div class="defile">${CATEGORIES.map(c => {
      const ici = jeux.filter(j => j.categorie === c.id);
      return `<section class="categorie"><h3>${icone(c.id)}${c.nom}</h3><p>${c.mesure}</p><div class="tuiles">
        ${ici.map(j => `<a class="tuile" href="#jeu/${j.id}" style="--jeu:${couleur(j)}"><div class="vignette"><canvas data-jeu="${j.id}" aria-hidden="true"></canvas></div><b>${j.nom}</b><small>${resume(j)}</small></a>`).join('')}
        ${'<div class="tuile bientot">Bientôt</div>'.repeat(Math.max(0, 3 - ici.length))}</div></section>`;
    }).join('')}<div style="height:16px"></div></div>
    ${onglets('jeux')}</section>`;
  const arrets = [...app.querySelectorAll('canvas[data-jeu]')].map(c => lancerDecor(jeux.find(j => j.id === c.dataset.jeu), c));
  return () => arrets.forEach(a => a());
}

export function stats({ app, jeux }) {
  const lignes = jeux.map(j => {
    const s = statsDe(j.id);
    const recs = modesDu(j).map(m => {
      const vals = Object.entries(s.records).filter(([k]) => k === m || k.startsWith(m + '-')).map(([, r]) => r.score);
      return vals.length ? `${nomDuMode(j, m)} ${nombre(Math.max(...vals))}` : null;
    }).filter(Boolean);
    return `<a class="ligne-jeu" href="#jeu/${j.id}/stats" style="--jeu:${couleur(j)};color:inherit;text-decoration:none"><span class="ligne-jeu"><i></i><span>${j.nom}<small>${recs.join(' · ') || 'Aucune partie'}</small></span></span><span class="discret-txt">${s.parties.length} partie${s.parties.length > 1 ? 's' : ''}</span></a>`;
  }).join('');
  app.innerHTML = `<section class="ecran hub"><h1 class="titre-onglet">Stats</h1><div class="defile">
    <div class="carte" style="margin-bottom:12px"><p class="aide">Score global</p><p class="accroche" style="margin:6px 0 0">Il réunira tes jeux par catégorie quand sa formule sera fixée (REGLES.md §11).</p></div>
    <div class="liste">${lignes || '<p class="vide">Aucun jeu branché.</p>'}</div>
    <p class="mention">Stats enregistrées sur cet appareil, dans ce navigateur.</p></div>
    ${onglets('stats')}</section>`;
}
export function reglages({ app, jeux, rafraichir, appliquerApparence }) {
  const r = lireReglages();
  const inter = (cle, nom, aide) => `<div><span>${nom}${aide ? `<small>${aide}</small>` : ''}</span><button class="interrupteur" role="switch" aria-checked="${!!r[cle]}" aria-label="${nom}" data-cle="${cle}"></button></div>`;
  app.innerHTML = `<section class="ecran hub"><h1 class="titre-onglet">Réglages</h1><div class="defile">
    <div class="liste">${inter('son', 'Son', 'Les jeux n’ont pas encore de son')}${inter('vibrations', 'Vibrations', 'À chaque erreur, sur téléphone')}</div>
    <div class="liste"><div><span>Apparence<small>Pour tout Brainer</small></span><span class="segments" role="group" aria-label="Apparence">
      ${APPARENCES.map(([k, n]) => `<button data-apparence="${k}" aria-pressed="${r.apparence === k}">${n}</button>`).join('')}</span></div>
      ${inter('daltonisme', 'Aide daltonisme', 'Formes en plus des couleurs')}</div>
    <div class="liste"><button data-action="exporter">Exporter mes données<span class="discret-txt">Copier</span></button>
      <button data-action="effacer"><span class="danger">Effacer toutes mes données</span></button></div>
    <div class="liste"><div><span>Version<small data-version>Brainer ${VERSION_HUB}${jeux.map(j => ` · ${j.nom} ${j.version}`).join('')}</small></span></div>
      <button data-action="maj">Rechercher une mise à jour<span class="discret-txt">›</span></button></div>
    <p class="mention">Brainer · fonctionne hors ligne après la première visite</p></div>
    ${onglets('reglages')}</section>`;
  versionPubliee().then(v => {
    const el = app.querySelector('[data-version]');
    if (v && v.date && el) el.textContent += ` · publiée le ${new Date(v.date).toLocaleDateString('fr-FR')}`;
  });
  app.querySelector('.defile').addEventListener('click', async e => {
    const i = e.target.closest('.interrupteur');
    if (i) { const v = i.getAttribute('aria-checked') !== 'true'; changerReglage(i.dataset.cle, v); i.setAttribute('aria-checked', v); return }
    const a = e.target.closest('button[data-apparence]');
    if (a) { changerReglage('apparence', a.dataset.apparence); appliquerApparence(a.dataset.apparence); rafraichir(); return }
    const act = e.target.closest('[data-action]')?.dataset.action;
    if (act === 'maj') {
      const r = await rechercherMaj();
      toast(r === 'disponible' ? 'Nouvelle version prête' : r === 'a-jour' ? 'Brainer est à jour' : 'Mises à jour indisponibles ici');
      return;
    }
    if (act === 'exporter') toast(await copier(JSON.stringify(toutesLesDonnees())) ? 'Données copiées' : 'Copie impossible');
    if (act === 'effacer' && await confirmer({ titre: 'Tout effacer ?', texte: 'Records, parties et réglages de tous les jeux seront supprimés de cet appareil.', oui: 'Effacer', danger: true })) {
      effacerTout(); appliquerApparence('nuit'); toast('Données effacées'); rafraichir();
    }
  });
}
