import { FULL, qbox, r1 } from './math';
import { makeSplitter } from './split';
import type { Quad } from './types';

/** Resultado da análise de uma página. */
export interface PageScan {
  w: number;
  h: number;
  color: boolean;
  panels: Quad[];
  /** quantos quadros foram achados, que fração da página eles cobrem e o tamanho do maior */
  found: number;
  cov: number;
  maxA: number;
}

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type MakeCanvas = (w: number, h: number) => { getContext(t: '2d', o?: object): Ctx2D | null };
interface Source { width: number; height: number }

/** altura de análise: calhas finas (2–3 px no original) ainda aparecem, e a análise segue rápida */
const SCAN_H = 640;

/** Analisa uma imagem (ImageBitmap ou <img>): tamanho, se é colorida e onde estão os quadros. */
export function scanImage(src: CanvasImageSource & Source, rtl: boolean, make: MakeCanvas): PageScan {
  const w = src.width, h = src.height;
  const W = Math.max(1, Math.round((w / h) * SCAN_H)), H = SCAN_H;
  const ctx = make(W, H).getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high'; // reduzir sem perder as molduras finas
  ctx.drawImage(src, 0, 0, W, H);
  const rgba = ctx.getImageData(0, 0, W, H).data;
  return { w, h, color: isColor(rgba), ...findPanels(rgba, W, H, rtl) };
}

/** Colorida se mais de 4% dos pixels têm saturação visível. */
function isColor(d: Uint8ClampedArray) {
  let col = 0, n = 0;
  for (let i = 0; i < d.length; i += 16) { n++; const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]); if (mx - mn > 30) col++; }
  return col / n > 0.04;
}

/**
 * Acha os quadros pelas calhas: o branco ligado às bordas da página é calha; cada mancha que sobra é um quadro.
 * Mancha grande pode ser vários quadros grudados por arte ou balão que atravessa a calha: aí ela é cortada pelas
 * calhas escondidas (ver split.ts). O contorno de cada quadro é um quadrilátero pelos 4 cantos extremos,
 * então quadros inclinados não puxam pedaço do vizinho.
 */
function findPanels(d: Uint8ClampedArray, W: number, H: number, rtl: boolean) {
  const n = W * H, g = new Uint8Array(n), hist = new Uint32Array(256);
  for (let i = 0; i < n; i++) { const v = (d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114) | 0; g[i] = v; hist[v]++; }
  let acc = 0, p95 = 255;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= n * 0.95) { p95 = v; break; } }
  const thr = Math.max(150, p95 - 28), bg = new Uint8Array(n), st = new Int32Array(n);
  let sp = 0;
  const push = (i: number) => { if (!bg[i] && g[i] >= thr) { bg[i] = 1; st[sp++] = i; } };
  for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x); }
  for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
  while (sp) { const i = st[--sp], x = i % W, y = (i / W) | 0; if (x > 0) push(i - 1); if (x < W - 1) push(i + 1); if (y > 0) push(i - W); if (y < H - 1) push(i + W); }

  type Piece = Shape & { src: number };
  const lab = new Uint8Array(n), px = new Int32Array(n), big: Piece[] = [], small: number[][] = [];
  const isBig = (s: Shape) => area(s.b) > n * 0.02 && s.cnt > n * 0.008;
  let split: ReturnType<typeof makeSplitter> | null = null, src = 0;
  for (let i = 0; i < n; i++) {
    if (bg[i] || lab[i]) continue;
    let cnt = 0;
    sp = 0; st[sp++] = i; lab[i] = 1;
    while (sp) {
      const k = st[--sp], x = k % W, y = (k / W) | 0;
      px[cnt++] = k;
      if (x > 0 && !bg[k - 1] && !lab[k - 1]) { lab[k - 1] = 1; st[sp++] = k - 1; }
      if (x < W - 1 && !bg[k + 1] && !lab[k + 1]) { lab[k + 1] = 1; st[sp++] = k + 1; }
      if (y > 0 && !bg[k - W] && !lab[k - W]) { lab[k - W] = 1; st[sp++] = k - W; }
      if (y < H - 1 && !bg[k + W] && !lab[k + W]) { lab[k + W] = 1; st[sp++] = k + W; }
    }
    const blob = px.subarray(0, cnt), s = shape(blob, W);
    if (isBig(s)) {
      split ??= makeSplitter(g, W, H, thr);
      src++;
      for (const piece of split(blob.slice())) { const p = shape(piece, W); if (isBig(p)) big.push({ ...p, src }); else if (p.cnt > n * 0.0006) small.push(p.b); }
    } else if (cnt > n * 0.0006) small.push(s.b);
  }
  const inside = (a: number[], o: number[]) => o[0] <= a[0] && o[1] <= a[1] && o[2] >= a[2] && o[3] >= a[3] && area(o) > area(a);
  // mancha dentro da caixa de outra mancha (não de um pedaço da mesma) não é quadro à parte
  const keep = big.filter((p) => !big.some((o) => o.src !== p.src && inside(p.b, o.b)));

  // balão ou onomatopeia solta na calha: junta ao quadro mais próximo para não sumir
  if (keep.length) {
    const U = [Math.min(...keep.map((k) => k.b[0])), Math.min(...keep.map((k) => k.b[1])), Math.max(...keep.map((k) => k.b[2])), Math.max(...keep.map((k) => k.b[3]))];
    for (const s of small) {
      const cx = (s[0] + s[2]) / 2, cy = (s[1] + s[3]) / 2;
      if (cx <= U[0] || cx >= U[2] || cy <= U[1] || cy >= U[3]) continue; // margem, número de página
      let best: Piece | null = null, bd = Infinity;
      for (const k of keep) { const dd = Math.max(0, k.b[0] - s[2], s[0] - k.b[2]) + Math.max(0, k.b[1] - s[3], s[1] - k.b[3]); if (dd < bd) { bd = dd; best = k; } }
      if (!best || bd >= Math.max(W, H) * 0.06) continue;
      const q = best.q;
      best.b = [Math.min(best.b[0], s[0]), Math.min(best.b[1], s[1]), Math.max(best.b[2], s[2]), Math.max(best.b[3], s[3])];
      if (s[0] + s[1] < q[0] + q[1]) { q[0] = s[0]; q[1] = s[1]; }
      if (s[2] - s[1] > q[2] - q[3]) { q[2] = s[2]; q[3] = s[1]; }
      if (s[2] + s[3] > q[4] + q[5]) { q[4] = s[2]; q[5] = s[3]; }
      if (s[0] - s[3] < q[6] - q[7]) { q[6] = s[0]; q[7] = s[3]; }
    }
  }

  const quads = keep.map(({ b, q, cnt }) => {
    const rect = [b[0], b[1], b[2], b[1], b[2], b[3], b[0], b[3]];
    const qa = Math.abs(q[0] * q[3] - q[2] * q[1] + (q[2] * q[5] - q[4] * q[3]) + (q[4] * q[7] - q[6] * q[5]) + (q[6] * q[1] - q[0] * q[7])) / 2;
    const use = qa >= cnt * 0.8 ? q : rect; // o quadrilátero deixa muito da mancha de fora? fica o retângulo
    return use.map((v, i) => r1(i % 2 ? (v / H) * 100 : (v / W) * 100));
  });
  return {
    panels: sortPanels(quads.length ? quads : [FULL.slice()], rtl),
    found: keep.length,
    cov: Math.min(1, keep.reduce((s, k) => s + area(k.b), 0) / n),
    maxA: keep.length ? Math.max(...keep.map((k) => area(k.b))) / n : 0,
  };
}

const area = (b: number[]) => (b[2] - b[0]) * (b[3] - b[1]);

interface Shape { b: number[]; q: number[]; cnt: number }
/**
 * Caixa e contorno de uma lista de pixels. O contorno é o maior quadrilátero com cantos no fecho convexo da mancha:
 * acerta os 4 cantos de quadros retos ou inclinados (mesmo bem inclinados) e ignora pontinhas soltas.
 */
function shape(px: ArrayLike<number>, W: number): Shape {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  const rowMin = new Map<number, number>(), rowMax = new Map<number, number>();
  for (let j = 0; j < px.length; j++) {
    const k = px[j], x = k % W, y = (k / W) | 0;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    if (!(rowMin.get(y)! <= x)) rowMin.set(y, x);
    if (!(rowMax.get(y)! >= x)) rowMax.set(y, x);
  }
  const pts: number[][] = [];
  for (const [y, x] of rowMin) { const X = rowMax.get(y)! + 1; pts.push([x, y], [x, y + 1], [X, y], [X, y + 1]); }
  return { b: [x0, y0, x1 + 1, y1 + 1], q: maxQuad(hull(pts)), cnt: px.length };
}

/** Fecho convexo (cadeia monótona). */
function hull(pts: number[][]) {
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: number[][] = [], hi: number[][] = [];
  for (const p of pts) { while (lo.length > 1 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (hi.length > 1 && cross(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
  return lo.slice(0, -1).concat(hi.slice(0, -1));
}

const tri = (a: number[], b: number[], c: number[]) => Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;

/** Maior quadrilátero com vértices no polígono convexo, na ordem [sup. esq., sup. dir., inf. dir., inf. esq.]. */
function maxQuad(h: number[][]): number[] {
  while (h.length > 48) { // simplifica tirando o vértice que menos faz falta
    let k = 0, least = Infinity;
    for (let i = 0; i < h.length; i++) { const a = tri(h[(i + h.length - 1) % h.length], h[i], h[(i + 1) % h.length]); if (a < least) { least = a; k = i; } }
    h.splice(k, 1);
  }
  let best = h.slice(0, 4), top = -1;
  const m = h.length;
  if (m > 4) {
    const far = (i: number, k: number) => { let bj = i, ba = -1; for (let j = (i + 1) % m; j !== k; j = (j + 1) % m) { const a = tri(h[i], h[j], h[k]); if (a > ba) { ba = a; bj = j; } } return [bj, ba]; };
    for (let i = 0; i < m; i++) for (let k = i + 2; k < m; k++) {
      const [j, a1] = far(i, k), [l, a2] = far(k, i);
      if (a1 + a2 > top) { top = a1 + a2; best = [h[i], h[j], h[k], h[l]]; }
    }
  }
  while (best.length < 4) best.push(best[best.length - 1] ?? [0, 0]);
  const cx = best.reduce((s, p) => s + p[0], 0) / 4, cy = best.reduce((s, p) => s + p[1], 0) / 4;
  best.sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx));
  let s0 = 0;
  best.forEach((p, i) => { if (p[0] + p[1] < best[s0][0] + best[s0][1]) s0 = i; });
  return [0, 1, 2, 3].flatMap((i) => best[(s0 + i) % 4]);
}

/** Ordem de leitura: fileiras de cima para baixo; dentro da fileira, no sentido do livro. */
export function sortPanels(qs: Quad[], rtl: boolean): Quad[] {
  const items = qs.map((q) => { const b = qbox(q); return { q, y0: b[1], y1: b[3], cx: b[0] + b[2] }; }).sort((a, b) => a.y0 - b.y0);
  const rows: { y0: number; y1: number; items: typeof items }[] = [];
  for (const it of items) {
    const row = rows.find((r) => Math.min(r.y1, it.y1) - Math.max(r.y0, it.y0) > 0.5 * Math.min(r.y1 - r.y0, it.y1 - it.y0));
    if (row) { row.items.push(it); row.y0 = Math.min(row.y0, it.y0); row.y1 = Math.max(row.y1, it.y1); } else rows.push({ y0: it.y0, y1: it.y1, items: [it] });
  }
  return rows.sort((a, b) => a.y0 - b.y0).flatMap((r) => r.items.sort((a, b) => (rtl ? b.cx - a.cx : a.cx - b.cx)).map((i) => i.q));
}
