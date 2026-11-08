/**
 * Separa quadros que ficaram grudados numa mancha só (arte, balão ou onomatopeia atravessando a calha).
 *
 * Uma calha de verdade é uma faixa clara entre duas molduras paralelas: em cada ponto dela há tinta logo acima
 * e logo abaixo (ou dos lados), a uma distância quase constante. A mancha é cortada recursivamente pela linha
 * (reta ou inclinada) que mais passa por trechos longos dessa faixa; quando não há corte de ponta a ponta,
 * tenta separar um quadro de canto (formato em L).
 */

type Box = [number, number, number, number];
interface Cut { sc: number; a: number; b: number; horiz: boolean }

const FAR = 10000;

export function makeSplitter(g: Uint8Array, W: number, H: number, thr: number) {
  const n = W * H, R = Math.max(4, Math.round(0.045 * H)), inkMax = thr - 70;
  const minA = n * 0.02, step = Math.max(1, Math.round(H / 420)), RUN = 11, SLOPE = 0.3;

  // distância até a tinta mais próxima em cada direção
  const up = new Int16Array(n), dn = new Int16Array(n), lf = new Int16Array(n), rt = new Int16Array(n);
  for (let x = 0; x < W; x++) {
    let last = -FAR;
    for (let y = 0; y < H; y++) { const i = y * W + x; if (g[i] < inkMax) last = y; up[i] = Math.min(FAR, y - last); }
    last = FAR * 2;
    for (let y = H - 1; y >= 0; y--) { const i = y * W + x; if (g[i] < inkMax) last = y; dn[i] = Math.min(FAR, last - y); }
  }
  for (let y = 0; y < H; y++) {
    let last = -FAR;
    for (let x = 0; x < W; x++) { const i = y * W + x; if (g[i] < inkMax) last = x; lf[i] = Math.min(FAR, x - last); }
    last = FAR * 2;
    for (let x = W - 1; x >= 0; x--) { const i = y * W + x; if (g[i] < inkMax) last = x; rt[i] = Math.min(FAR, last - x); }
  }

  // gh/gv: claro entre molduras (calha horizontal/vertical); oh/ov: claro aberto (não conta nem a favor nem contra)
  const gh = new Uint8Array(n), gv = new Uint8Array(n), oh = new Uint8Array(n), ov = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (g[i] < thr) continue;
    if (up[i] <= R && dn[i] <= R) gh[i] = 1; else oh[i] = 1;
    if (lf[i] <= R && rt[i] <= R) gv[i] = 1; else ov[i] = 1;
  }

  /** As molduras dos dois lados da calha seguem retas neste ponto (a distância até a tinta quase não muda ao lado). */
  const straight = (i: number, horiz: boolean) => {
    const [d1, d2, s, edge] = horiz ? [up, dn, 1, i % W] : [lf, rt, W, (i / W) | 0];
    const last = (horiz ? W : H) - 1, a = edge > 0 ? i - s : i, b = edge < last ? i + s : i;
    return Math.abs(d1[i] - d1[a]) <= 2 && Math.abs(d1[i] - d1[b]) <= 2 && Math.abs(d2[i] - d2[a]) <= 2 && Math.abs(d2[i] - d2[b]) <= 2;
  };

  /** Melhor corte de ponta a ponta da caixa, na horizontal (esquerda→direita) ou na vertical. */
  function bestCut([x0, y0, x1, y1]: Box, horiz: boolean): Cut | null {
    const [L0, L1, A0, A1] = horiz ? [x0, x1, y0, y1] : [y0, y1, x0, x1];
    const G = horiz ? gh : gv, O = horiz ? oh : ov;
    const span = L1 - L0;
    if (span < 30 || A1 - A0 < 30) return null;
    const m = Math.max(8, Math.round(0.05 * (horiz ? H : W))), reach = Math.floor(SLOPE * span);
    const lo = A0 + m, hi = A1 - m - 1;
    const at = (l: number, a: number, b: number) => {
      const p = Math.round(a + ((b - a) * (l - L0)) / span);
      return horiz ? p * W + l : l * W + p;
    };
    /** Fração da linha a→b que corre por trechos longos de calha (claro aberto não conta); -1 se for pouca. */
    const score = (a: number, b: number, ss: number, minRun: number) => {
      let run = 0, good = 0, open = 0, nT = 0;
      for (let l = L0; l < L1; l += ss, nT++) {
        const i = at(l, a, b);
        if (G[i]) run++;
        else { if (run >= minRun) good += run; run = 0; if (O[i]) open++; }
      }
      if (run >= minRun) good += run;
      return good < 0.3 * nT ? -1 : good / Math.max(1, nT - open);
    };
    // busca grossa, depois refina em volta dos melhores
    const cs = 2 * step, top: Cut[] = [];
    for (let a = lo; a <= hi; a += cs) {
      for (let b = Math.max(lo, a - reach), bEnd = Math.min(hi, a + reach); b <= bEnd; b += cs) {
        const sc = score(a, b, cs, Math.ceil((RUN * step) / cs));
        if (sc <= 0) continue;
        const near = top.findIndex((c) => Math.abs(c.a - a) <= cs && Math.abs(c.b - b) <= cs);
        if (near >= 0) { if (top[near].sc < sc) top[near] = { sc, a, b, horiz }; continue; }
        top.push({ sc, a, b, horiz }); top.sort((p, q) => q.sc - p.sc); if (top.length > 8) top.pop();
      }
    }
    let best: Cut | null = null;
    for (const c of top) {
      for (let a = Math.max(lo, c.a - cs); a <= Math.min(hi, c.a + cs); a++) {
        for (let b = Math.max(lo, a - reach, c.b - cs), bEnd = Math.min(hi, a + reach, c.b + cs); b <= bEnd; b++) {
          const sc = score(a, b, step, RUN);
          if (sc > 0 && (!best || sc > best.sc)) best = { sc, a, b, horiz };
        }
      }
    }
    if (!best || best.sc < 0.55) return null;

    // as duas molduras precisam ser paralelas: a largura da calha quase não varia
    // e quase sempre retas (entrelinhas de texto num balão parecem calha, mas a "moldura" delas é recortada)
    const widths: number[] = [];
    let run: number[] = [], flat = 0, runFlat = 0;
    const flush = () => { if (run.length >= RUN) { widths.push(...run); flat += runFlat; } run = []; runFlat = 0; };
    for (let l = L0; l < L1; l += step) {
      const i = at(l, best.a, best.b);
      if (G[i]) { run.push(horiz ? up[i] + dn[i] : lf[i] + rt[i]); if (straight(i, horiz)) runFlat++; } else flush();
    }
    flush();
    if (widths.length < 10 || flat < 0.6 * widths.length) return null;
    const med = widths.slice().sort((p, q) => p - q)[widths.length >> 1];
    return widths.filter((w) => Math.abs(w - med) <= 3).length / widths.length >= 0.5 ? best : null;
  }

  // ---- quadro de canto (L): só cortes retos, só em molduras retas, com folga de ±2 px
  let rowG: Int32Array, rowO: Int32Array, colG: Int32Array, colO: Int32Array, ready = false;
  function prepCorners() {
    const k = Math.max(3, Math.round((5 * H) / 840)), run = 2 * k + 1;
    const ch = new Uint8Array(n), cv = new Uint8Array(n);
    for (let y = 0; y < H; y++) {
      let s = 0;
      for (let x = 0; x <= W; x++) {
        const i = y * W + x;
        const ok = x < W && gh[i] && straight(i, true);
        if (ok) continue;
        if (x - s >= run) for (let j = s; j < x; j++) ch[y * W + j] = 1;
        s = x + 1;
      }
    }
    for (let x = 0; x < W; x++) {
      let s = 0;
      for (let y = 0; y <= H; y++) {
        const i = y * W + x;
        const ok = y < H && gv[i] && straight(i, false);
        if (ok) continue;
        if (y - s >= run) for (let j = s; j < y; j++) cv[j * W + x] = 1;
        s = y + 1;
      }
    }
    // ±2 px de folga perpendicular à calha
    const near = (c: Uint8Array, i: number, d: number, lo: number, hi: number, p: number) => {
      for (let o = -2; o <= 2; o++) { const q = p + o; if (q >= lo && q < hi && c[i + o * d]) return 1; }
      return 0;
    };
    const W1 = W + 1;
    rowG = new Int32Array(H * W1); rowO = new Int32Array(H * W1); colG = new Int32Array((H + 1) * W); colO = new Int32Array((H + 1) * W);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, hc = near(ch, i, W, 0, H, y), vc = near(cv, i, 1, 0, W, x);
      rowG[y * W1 + x + 1] = rowG[y * W1 + x] + hc;
      rowO[y * W1 + x + 1] = rowO[y * W1 + x] + (oh[i] && !hc ? 1 : 0);
      colG[(y + 1) * W + x] = colG[y * W + x] + vc;
      colO[(y + 1) * W + x] = colO[y * W + x] + (ov[i] && !vc ? 1 : 0);
    }
    ready = true;
  }

  function cornerCut([x0, y0, x1, y1]: Box) {
    if (!ready) prepCorners();
    const W1 = W + 1, m = Math.max(8, Math.round(0.05 * H));
    let best: { sc: number; cx: number; cy: number; left: boolean; top: boolean } | null = null;
    for (let cy = y0 + m; cy < y1 - m; cy++) for (let cx = x0 + m; cx < x1 - m; cx++) {
      for (const left of [true, false]) {
        const r = cy * W1;
        const hg = left ? rowG[r + cx] - rowG[r + x0] : rowG[r + x1] - rowG[r + cx];
        const ho = left ? rowO[r + cx] - rowO[r + x0] : rowO[r + x1] - rowO[r + cx];
        const hl = left ? cx - x0 : x1 - cx;
        if (hg < 0.35 * hl || hl < 0.25 * (x1 - x0)) continue;
        for (const top of [true, false]) {
          const vg = top ? colG[cy * W + cx] - colG[y0 * W + cx] : colG[y1 * W + cx] - colG[cy * W + cx];
          const vo = top ? colO[cy * W + cx] - colO[y0 * W + cx] : colO[y1 * W + cx] - colO[cy * W + cx];
          const vl = top ? cy - y0 : y1 - cy;
          if (vg < 0.35 * vl || vl < 0.25 * (y1 - y0)) continue;
          const sc = Math.min(hg / Math.max(1, hl - ho), vg / Math.max(1, vl - vo));
          if (sc >= 0.6 && (!best || sc > best.sc)) best = { sc, cx, cy, left, top };
        }
      }
    }
    return best;
  }

  const boxOf = (px: Int32Array): Box => {
    let x0 = W, y0 = H, x1 = 0, y1 = 0;
    for (const i of px) { const x = i % W, y = (i / W) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return [x0, y0, x1 + 1, y1 + 1];
  };
  const part = (px: Int32Array, side: (x: number, y: number) => boolean) => {
    const a: number[] = [], b: number[] = [];
    for (const i of px) (side(i % W, (i / W) | 0) ? b : a).push(i);
    return [Int32Array.from(a), Int32Array.from(b)] as const;
  };

  /** Pedaços (listas de pixels) em que a mancha se divide; a própria mancha se não houver calha escondida. */
  function split(px: Int32Array, depth = 0): Int32Array[] {
    if (depth > 8 || px.length < 2 * minA) return [px];
    const box = boxOf(px), [x0, y0, x1, y1] = box;
    const cuts = [bestCut(box, true), bestCut(box, false)].filter((c): c is Cut => !!c).sort((p, q) => q.sc - p.sc);
    for (const { a, b, horiz } of cuts) {
      const [p1, p2] = part(px, horiz ? (x, y) => y > a + ((b - a) * (x - x0)) / Math.max(1, x1 - x0) : (x, y) => x > a + ((b - a) * (y - y0)) / Math.max(1, y1 - y0));
      if (p1.length >= minA && p2.length >= minA) return [...split(p1, depth + 1), ...split(p2, depth + 1)];
    }
    const c = cornerCut(box);
    if (c) {
      const [rest, corner] = part(px, (x, y) => (c.left ? x < c.cx : x >= c.cx) && (c.top ? y < c.cy : y >= c.cy));
      if (corner.length >= minA && rest.length >= minA) return [...split(corner, depth + 1), ...split(rest, depth + 1)];
    }
    return [px];
  }

  return split;
}
