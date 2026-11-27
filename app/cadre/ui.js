// Petits outils d'interface partagés par les écrans du cadre.

export const nombre = n => Math.round(n).toLocaleString('fr-FR');

export const pourcent = x => `${Math.round(x * 100)} %`;

// Adapte la taille interne d'un canvas à sa taille affichée (écrans haute densité).
export function dimensionner(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const l = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(l * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(l * dpr); canvas.height = Math.round(h * dpr);
  }
  return { l, h, dpr };
}

// Lance un décor de jeu dans un canvas ; renvoie une fonction d'arrêt.
export function lancerDecor(jeu, canvas) {
  if (!jeu || typeof jeu.decor !== 'function') return () => {};
  dimensionner(canvas);
  let poignee = null;
  try { poignee = jeu.decor(canvas, { dpr: canvas.width / Math.max(1, canvas.clientWidth) }) } catch (e) { console.error(`[${jeu.id}] décor :`, e) }
  const surResize = () => { dimensionner(canvas); poignee?.redimensionner?.() };
  addEventListener('resize', surResize);
  return () => { removeEventListener('resize', surResize); try { poignee?.arreter?.() } catch (e) {} };
}

let minuteurToast = 0;
export function toast(texte) {
  document.querySelector('.toast')?.remove();
  const t = document.createElement('div');
  t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = texte;
  document.body.append(t);
  clearTimeout(minuteurToast);
  minuteurToast = setTimeout(() => t.remove(), 2400);
}

// Boîte de confirmation dans la page (pas de confirm() du navigateur).
export function confirmer({ titre, texte, oui, non = 'Annuler', danger = false }) {
  return new Promise(resoudre => {
    const d = document.createElement('div');
    d.className = 'dialogue';
    d.innerHTML = `<div class="carte" role="alertdialog" aria-modal="true"><h2></h2><p class="aide" style="font-size:15px"></p>
      <button class="btn principal" data-r="1" ${danger ? 'style="--jeu:var(--err)"' : ''}></button><button class="btn discret" data-r="0"></button></div>`;
    d.querySelector('h2').textContent = titre;
    d.querySelector('p').textContent = texte;
    d.querySelector('[data-r="1"]').textContent = oui;
    d.querySelector('[data-r="0"]').textContent = non;
    d.addEventListener('click', e => {
      const b = e.target.closest('[data-r]');
      if (b || e.target === d) { d.remove(); resoudre(b?.dataset.r === '1') }
    });
    document.body.append(d);
    d.querySelector('[data-r="0"]').focus();
  });
}

export async function copier(texte) {
  try { await navigator.clipboard.writeText(texte); return true }
  catch (e) {
    const zone = document.createElement('textarea');
    zone.value = texte; zone.style.cssText = 'position:fixed;opacity:0';
    document.body.append(zone); zone.select();
    let ok = false; try { ok = document.execCommand('copy') } catch (e2) {}
    zone.remove(); return ok;
  }
}

// Appui long (2 s par défaut) sur un élément.
export function appuiLong(el, action, duree = 2000) {
  let m = 0;
  const go = () => { clearTimeout(m); m = setTimeout(action, duree) };
  const stop = () => clearTimeout(m);
  el.addEventListener('pointerdown', go);
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => el.addEventListener(t, stop));
}
