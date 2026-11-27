// Point d'entrée du hub : charge les jeux, applique l'apparence, aiguille les écrans selon l'adresse.
//   #jeux  #stats  #reglages                         onglets du hub
//   #jeu/<id>  #jeu/<id>/modes|niveaux|tutoriel|stats  écrans communs d'un jeu (REGLES.md §2)
// La partie n'a pas d'adresse : elle se lance depuis les modes ou la grille des niveaux.
import { chargerJeux } from './registre.js';
import { reglages, importerSiBesoin } from './stockage.js';
import { lancerDecor } from './ui.js';
import * as hub from './ecrans/hub.js';
import * as ecransJeu from './ecrans/jeu.js';
import { lancerPartie } from './ecrans/partie.js';
import { demarrerMaj, reafficher } from './maj.js';

const app = document.getElementById('app');
const canvasDecor = document.getElementById('decor');
const etat = { jeux: [], nettoyer: () => {}, decorDe: undefined, arreterDecor: () => {}, enPartie: false };

const couleurDe = jeu => jeu.couleur[reglages().apparence] || jeu.couleur.nuit;

export function appliquerApparence(a) {
  document.documentElement.dataset.apparence = a;
  const fond = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', fond);
}

function poserDecor(jeu) {
  if (etat.decorDe === jeu) return;
  etat.arreterDecor();
  canvasDecor.getContext('2d').clearRect(0, 0, canvasDecor.width, canvasDecor.height);
  etat.decorDe = jeu;
  etat.arreterDecor = jeu ? lancerDecor(jeu, canvasDecor) : () => {};
}

function aller(h) {
  if (location.hash === h) afficher(); else location.hash = h;
}

function afficher() {
  try { etat.nettoyer() } catch (e) { console.error(e) }
  etat.nettoyer = () => {};
  etat.enPartie = false;
  const [vue = 'jeux', id, sous = 'accueil'] = location.hash.slice(1).split('/');
  const ctx = { app, jeux: etat.jeux, aller, rafraichir: afficher, appliquerApparence };
  if (vue === 'jeu') {
    const jeu = etat.jeux.find(j => j.id === id);
    if (!jeu || !ecransJeu[sous]) return aller('#jeux');
    ctx.jeu = jeu;
    ctx.jouer = (mode, niveau) => {
      try { etat.nettoyer() } catch (e) {}
      poserDecor(null);
      etat.enPartie = true;
      reafficher();
      etat.nettoyer = lancerPartie(ctx, mode, niveau);
    };
    app.style.setProperty('--jeu', couleurDe(jeu));
    poserDecor(jeu);
    etat.nettoyer = ecransJeu[sous](ctx) || (() => {});
  } else {
    if (!hub[vue]) return aller('#jeux');
    app.style.removeProperty('--jeu');
    poserDecor(null);
    etat.nettoyer = hub[vue](ctx) || (() => {});
  }
  app.querySelector('h1,h2,.titre-onglet')?.setAttribute('tabindex', '-1');
  reafficher();
}

async function demarrer() {
  appliquerApparence(reglages().apparence);
  etat.jeux = await chargerJeux();
  etat.jeux.forEach(importerSiBesoin);
  addEventListener('hashchange', afficher);
  afficher();
  demarrerMaj(() => etat.enPartie);
}

demarrer();
