import { FULL } from '../core/math';
import type { View } from '../core/prefs';
import type { Book, Quad } from '../core/types';

/** Um quadro dentro de uma cena. */
export interface Item { id: string; p: number; j: number; q: Quad }
export interface Scene { name: string; items: Item[]; pages: number[] }
/**
 * Um passo da leitura. `full`: página inteira; `panel`: quadro no palco; `page`: quadro no modo página.
 * Todo passo sabe sua página (p), seu quadro (j, -1 = página inteira) e sua cena (s, -1 = nenhuma).
 */
export interface Step { k: 'full' | 'panel' | 'page'; p: number; j: number; s: number; i: number }

export interface Model { steps: Step[]; scenes: Scene[]; used: number[] }

/** Transforma o livro numa sequência de passos (um por quadro). */
export function buildModel(book: Book, view: View): Model {
  const steps: Step[] = [], scenes: Scene[] = [], used: number[] = [];
  let cur = -1;
  book.pages.forEach((p, pi) => {
    if (p.type === 'skip') return;
    used.push(pi);
    if (p.type !== 'story') { steps.push({ k: 'full', p: pi, j: -1, s: cur, i: -1 }); return; }
    if (p.scene || cur < 0) { scenes.push({ name: p.scene || `Cena ${scenes.length + 1}`, items: [], pages: [] }); cur = scenes.length - 1; }
    const sc = scenes[cur];
    sc.pages.push(pi);
    (p.panels.length ? p.panels : [FULL]).forEach((q, j) => {
      sc.items.push({ id: `${pi}:${j}`, p: pi, j, q });
      steps.push({ k: view === 'palco' ? 'panel' : 'page', p: pi, j, s: cur, i: sc.items.length - 1 });
    });
  });
  return { steps, scenes, used };
}

/** Passo mais próximo de uma posição (página, quadro). */
export function stepAt(steps: Step[], page: number, panel: number) {
  let best = 0;
  for (let k = 0; k < steps.length; k++) {
    const s = steps[k];
    if (s.p < page) best = k;
    else if (s.p === page) { if (s.j <= panel) best = k; else break; }
    else break;
  }
  return best;
}

/** Cena sem nome aparece pelo intervalo de páginas, para não repetir o número. */
export function sceneLabel(sc: Scene) {
  if (!/^cena \d+$/i.test(sc.name)) return sc.name;
  const a = sc.pages[0] + 1, b = sc.pages[sc.pages.length - 1] + 1;
  return a === b ? `pág. ${a}` : `págs. ${a}–${b}`;
}
