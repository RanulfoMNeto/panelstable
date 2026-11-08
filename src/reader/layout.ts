import { clamp, qbox } from '../core/math';
import type { PageInfo } from '../core/types';
import type { Item } from './model';

/** Caixa [x, y, w, h] em px do palco. */
export type Box = number[];
/** Geometria de um quadro: recorte na imagem (px), formato normalizado (0–1) e proporção. */
export interface Geo { crop: number[]; shape: number[]; a: number }
/** Medidas do palco. */
export interface Frame { W: number; H: number; rtl: boolean; compact: boolean }

const PAD = 0.45; // folga em volta do quadro, em % da largura da página (não come o traço da borda)
/** Ampliação máxima: ~2,2 px de tela por pixel da imagem (evita borrão). */
export const maxScale = () => Math.max(1.2, 2.2 / (window.devicePixelRatio || 1));

export function geometry(it: Item, page: PageInfo): Geo {
  const b = qbox(it.q), full = it.j < 0, a = page.w / page.h;
  const px = full ? 0 : PAD, py = full ? 0 : PAD * a;
  const x0 = Math.max(0, b[0] - px), y0 = Math.max(0, b[1] - py), x1 = Math.min(100, b[2] + px), y1 = Math.min(100, b[3] + py);
  const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
  const shape = it.q.map((v, i) => (i % 2
    ? (clamp(v + (v < cy ? -py : py), y0, y1) - y0) / Math.max(0.01, y1 - y0)
    : (clamp(v + (v < cx ? -px : px), x0, x1) - x0) / Math.max(0.01, x1 - x0)));
  const crop = [(x0 / 100) * page.w, (y0 / 100) * page.h, Math.max(1, ((x1 - x0) / 100) * page.w), Math.max(1, ((y1 - y0) / 100) * page.h)];
  return { crop, shape, a: crop[2] / crop[3] };
}

/** Encolhe a caixa (centrada) se a imagem fosse ampliada além do limite. */
function capBox(g: Geo, b: Box): Box {
  const m = maxScale();
  if (b[2] / g.crop[2] <= m) return b;
  const w = g.crop[2] * m, h = g.crop[3] * m;
  return [b[0] + (b[2] - w) / 2, b[1] + (b[3] - h) / 2, w, h];
}

/** Encaixa o quadro inteiro (sem cortar) dentro da área, alinhado por ax/ay (0 = início, 1 = fim). */
export function fitIn(g: Geo, x: number, y: number, w: number, h: number, ax = 0.5, ay = 0.5): Box {
  const s = Math.min(w / g.crop[2], h / g.crop[3]), bw = g.crop[2] * s, bh = g.crop[3] * s;
  return capBox(g, [x + (w - bw) * ax, y + (h - bh) * ay, bw, bh]);
}

/** Todas as divisões de n itens, em ordem, em até g grupos. */
function parts(n: number, g: number): number[][] {
  const out: number[][] = [];
  const rec = (left: number, acc: number[]) => {
    if (!left) { out.push(acc); return; }
    if (acc.length >= g) return;
    for (let k = 1; k <= left; k++) rec(left - k, [...acc, k]);
  };
  rec(n, []);
  return out;
}

/** Fileiras justificadas dentro de uma área, no sentido de leitura. */
function rows(gs: Geo[], ks: number[], X: number, Y: number, W: number, H: number, gap: number, rtl: boolean, ax: number, ay: number): Box[] | null {
  let i = 0;
  const G = ks.map((k) => { const r = gs.slice(i, (i += k)); return { r, k, A: r.reduce((s, g) => s + g.a, 0), t: 0 }; });
  const inv = G.reduce((s, g) => s + 1 / g.A, 0), off = G.reduce((s, g) => s + (gap * (g.k - 1)) / g.A, 0);
  const L = Math.min(W, (H - gap * (G.length - 1) + off) / inv);
  if (!(L > 0)) return null;
  G.forEach((g) => (g.t = (L - gap * (g.k - 1)) / g.A));
  if (G.some((g) => !(g.t > 0))) return null;
  const T = G.reduce((s, g) => s + g.t, 0) + gap * (G.length - 1), out: Box[] = [];
  let y = Y + (H - T) * ay;
  for (const g of G) {
    const x0 = X + (W - L) * ax;
    let x = rtl ? x0 + L : x0;
    for (const q of g.r) { const w = g.t * q.a; if (rtl) x -= w; out.push(capBox(q, [x, y, w, g.t])); x += rtl ? -gap : w + gap; }
    y += g.t + gap;
  }
  return out;
}

/**
 * Regra fixa do palco:
 * · só quadros da página atual; ao virar a página o palco recomeça;
 * · o quadro atual fica no destaque; os já lidos ficam numa faixa — do lado onde a leitura começa em telas largas,
 *   em cima em telas altas —, em ordem de leitura. Quem entra na faixa não sai até a página acabar.
 */
export function compose(hero: Geo, prev: Geo[], f: Frame) {
  const { W, H, rtl } = f, gap = Math.max(8, Math.min(W, H) * 0.02);
  if (!prev.length) return { hero: fitIn(hero, 0, 0, W, H), sups: [] as Box[], gap };
  const top = W / H < 1.15; // tela alta: faixa em cima; tela larga (inclusive celular deitado): faixa ao lado
  const band = top ? [0, 0, W, H * 0.3] : [rtl ? W * 0.68 : 0, 0, W * 0.32, H];
  const rest = top ? [0, band[3] + gap, W, H - band[3] - gap] : [rtl ? 0 : band[2] + gap, 0, W - band[2] - gap, H];
  let best: Box[] = [], area = -1;
  for (const ks of parts(prev.length, 4)) {
    const r = rows(prev, ks, band[0], band[1], band[2], band[3], gap, rtl, top ? 0.5 : rtl ? 0 : 1, top ? 1 : 0.5);
    const a = r ? r.reduce((s, b) => s + b[2] * b[3], 0) : -1;
    if (r && a > area + 1) { area = a; best = r; }
  }
  return { hero: fitIn(hero, rest[0], rest[1], rest[2], rest[3], top ? 0.5 : rtl ? 1 : 0, top ? 0 : 0.5), sups: best, gap };
}

/** Maior retângulo vazio da área (fora dos quadros e das calhas). */
export function emptyRect(bs: Box[], W: number, H: number, gap: number, minSide: number): Box | null {
  const xs = [...new Set([0, W, ...bs.flatMap((b) => [b[0] - gap, b[0] + b[2] + gap])].map((v) => clamp(v, 0, W)))].sort((a, b) => a - b);
  const ys = [...new Set([0, H, ...bs.flatMap((b) => [b[1] - gap, b[1] + b[3] + gap])].map((v) => clamp(v, 0, H)))].sort((a, b) => a - b);
  let best: Box | null = null, ba = 0;
  for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) for (let k = 0; k < ys.length; k++) for (let l = k + 1; l < ys.length; l++) {
    const x0 = xs[i], x1 = xs[j], y0 = ys[k], y1 = ys[l], a = (x1 - x0) * (y1 - y0);
    if (a <= ba || x1 - x0 < minSide || y1 - y0 < minSide) continue;
    if (bs.some((b) => x0 < b[0] + b[2] + gap - 0.5 && x1 > b[0] - gap + 0.5 && y0 < b[1] + b[3] + gap - 0.5 && y1 > b[1] - gap + 0.5)) continue;
    ba = a; best = [x0, y0, x1 - x0, y1 - y0];
  }
  return best;
}
