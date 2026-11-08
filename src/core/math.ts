import type { Quad } from './types';

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const clamp01 = (v: number) => clamp(v, 0, 1);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const lerpArr = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);
/** easeInOutCubic */
export const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
export const r1 = (v: number) => Math.round(v * 10) / 10;
export const pad2 = (n: number) => String(n).padStart(2, '0');

export const FULL: Quad = [0, 0, 100, 0, 100, 100, 0, 100];

/** Caixa [x0, y0, x1, y1] que envolve o quadrilátero. */
export const qbox = (q: Quad) => [
  Math.min(q[0], q[2], q[4], q[6]),
  Math.min(q[1], q[3], q[5], q[7]),
  Math.max(q[0], q[2], q[4], q[6]),
  Math.max(q[1], q[3], q[5], q[7]),
];

/** "x,y x,y …" para <polygon points>. */
export const svgPoints = (q: number[]) => `${q[0]},${q[1]} ${q[2]},${q[3]} ${q[4]},${q[5]} ${q[6]},${q[7]}`;
/** polygon(…) para clip-path, em %. */
export const clipPolygon = (q: number[]) => `polygon(${q[0]}% ${q[1]}%,${q[2]}% ${q[3]}%,${q[4]}% ${q[5]}%,${q[6]}% ${q[7]}%)`;

/** Revela o quadrilátero de cima para baixo (t de 0 a 1). */
export const growQ = (q: Quad, t: number): Quad => [q[0], q[1], q[2], q[3], q[2] + (q[4] - q[2]) * t, q[3] + (q[5] - q[3]) * t, q[0] + (q[6] - q[0]) * t, q[1] + (q[7] - q[1]) * t];

/** Máscara de retícula: a imagem aparece/some em pontos, como impressão. */
export function halftone(style: CSSStyleDeclaration, v: number) {
  if (v < 0.995) {
    const r = v * 5.4, m = `radial-gradient(circle, #000 ${r.toFixed(2)}px, transparent ${(r + 0.9).toFixed(2)}px)`;
    style.maskImage = m; style.webkitMaskImage = m; style.maskSize = '7px 7px'; style.webkitMaskSize = '7px 7px';
  } else if (style.maskImage || style.webkitMaskImage) {
    style.maskImage = ''; style.webkitMaskImage = '';
  }
}
