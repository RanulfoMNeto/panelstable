import { $, svg } from '../core/dom';
import { clamp, clamp01, clipPolygon, ease, FULL, growQ, halftone, lerpArr, qbox, svgPoints } from '../core/math';
import { imageFilter, prefs } from '../core/prefs';
import type { Quad } from '../core/types';
import { maxScale, type Frame } from './layout';
import type { Doc, ReaderView } from './view';

interface Layer { el: HTMLDivElement; im: HTMLImageElement; q: Quad; key: string }
interface PageNode { el: HTMLDivElement; layers: Layer[]; hl: SVGSVGElement; po: SVGPolygonElement; pi: SVGPolygonElement; a: number; w: number; idx: number }
interface Cam { s: number; tx: number; ty: number }

const GAP = 14;

/** Modo página: a página no layout original, com os quadros acendendo um a um sobre o preto. */
export class Pagina implements ReaderView {
  private root = $('#pages');
  private cache = new Map<number, PageNode>();
  private f: Frame = { W: 400, H: 600, rtl: true, compact: false };
  private spread = false;
  private camKey = '';

  constructor(private doc: Doc) {}

  /** Zoom em uso: "auto" aproxima no celular e mostra a página inteira em telas largas. */
  zoom() { return prefs.zoom === 'auto' ? (this.f.compact ? 'full' : 'off') : prefs.zoom; }

  show(on: boolean) { this.root.hidden = !on; }
  layout(f: Frame) {
    this.f = f;
    this.spread = this.zoom() === 'off' && !f.compact && f.W / f.H > 1.1; // livro aberto só sem zoom
    this.cache.forEach((c) => this.fit(c));
    this.camKey = '?'; // força reaplicar a câmera (inclusive para tirar o zoom)
  }
  clear() { this.cache.forEach((c) => c.el.remove()); this.cache.clear(); this.setCam(null); }
  refresh() { this.cache.forEach((c) => c.layers.forEach((L) => { L.key = ''; L.im.style.filter = imageFilter(this.doc.book.pages[c.idx].color); })); this.layout(this.f); }

  render(t: number) {
    const { steps, used } = this.doc.model;
    const k = Math.min(steps.length - 1, Math.floor(t)), f = k >= steps.length - 1 ? 0 : t - k;
    const A = steps[k], B = steps[Math.min(steps.length - 1, k + 1)];
    const aj = Math.max(0, A.j), bj = Math.max(0, B.j);
    const ia = used.indexOf(A.p), pa = this.spread && ia > 0 ? used[ia - 1] : null, moving = f > 0 && B.p !== A.p;
    const keep = new Set([A.p, ...(moving ? [B.p] : []), ...(pa != null ? [pa] : [])]);
    for (const [pi, c] of this.cache) {
      if (!keep.has(pi)) c.el.style.display = 'none';
      if (Math.abs(used.indexOf(pi) - ia) > 3) { c.el.remove(); this.cache.delete(pi); }
    }
    const ca = this.page(A.p), cp = pa != null ? this.page(pa) : null, e = ease(f), zoom = this.zoom() !== 'off';
    const xa = cp ? this.slotX(ca, 0) : 0;
    const qOf = (c: PageNode, j: number) => c.layers[clamp(j, 0, c.layers.length - 1)].q;
    if (cp) { cp.layers.forEach((L) => this.layer(L, moving ? 1 - e : 1, false)); this.highlight(cp, cp.layers[0].q, 0); }

    if (!moving) {
      this.place(ca, xa); if (cp) this.place(cp, this.slotX(cp, 1));
      const jb = B.p === A.p ? bj : aj;
      ca.layers.forEach((L, j) => this.layer(L, j <= aj ? 1 : j === aj + 1 && f > 0 ? e : 0, true));
      this.highlight(ca, lerpArr(qOf(ca, aj), qOf(ca, jb), e), ca.layers.length > 1 ? 1 : 0);
      this.setCam(zoom ? mix(this.cam(ca, qOf(ca, aj), xa), this.cam(ca, qOf(ca, jb), xa), e) : null);
      return;
    }
    const cb = this.page(B.p), eb = ease(clamp01((f - 0.35) / 0.65));
    if (this.spread) {
      // a página atual desliza para o lado e se completa; a anterior sai; a nova entra no lugar
      this.place(ca, xa + (this.slotX(ca, 1) - xa) * e);
      ca.layers.forEach((L, j) => this.layer(L, j <= aj ? 1 : e, false));
      if (cp) { const x1 = this.slotX(cp, 1); this.place(cp, x1 + Math.sign(x1) * e * cp.w * 0.2); }
      this.place(cb, this.slotX(cb, 0));
    } else {
      this.place(ca, 0); this.place(cb, 0);
      ca.layers.forEach((L, j) => this.layer(L, (j <= aj ? 1 : 0) * (1 - clamp01((e - j * 0.04) / 0.8)), false));
    }
    this.highlight(ca, qOf(ca, aj), ca.layers.length > 1 ? 1 - e : 0);
    cb.layers.forEach((L, j) => this.layer(L, j === 0 ? eb : 0, true));
    this.highlight(cb, qOf(cb, bj), cb.layers.length > 1 ? eb : 0);
    this.setCam(zoom ? mix(this.cam(ca, qOf(ca, aj), 0), this.cam(cb, qOf(cb, bj), 0), e) : null);
  }

  private page(pi: number): PageNode {
    let c = this.cache.get(pi);
    if (!c) {
      const p = this.doc.book.pages[pi], el = document.createElement('div');
      el.className = 'pg';
      const qs = p.type === 'story' && p.panels.length ? p.panels : [FULL];
      const layers = qs.map((q) => {
        const L = document.createElement('div'); L.className = 'pl'; L.style.visibility = 'hidden';
        const im = new Image(); im.src = this.doc.urls[pi]; im.alt = ''; im.draggable = false; im.decoding = 'async'; im.style.filter = imageFilter(p.color);
        const b = qbox(q); im.style.transformOrigin = `${(b[0] + b[2]) / 2}% ${(b[1] + b[3]) / 2}%`;
        L.append(im); el.append(L);
        return { el: L, im, q, key: '' };
      });
      const hl = svg('svg', { class: 'hl', viewBox: '0 0 100 100', preserveAspectRatio: 'none', 'aria-hidden': 'true' });
      const po = svg('polygon', { class: 'o' }), pin = svg('polygon', { class: 'i' });
      hl.append(po, pin); el.append(hl); this.root.append(el);
      c = { el, layers, hl, po, pi: pin, a: p.w / p.h, w: 0, idx: pi };
      this.cache.set(pi, c); this.fit(c);
    }
    c.el.style.display = '';
    return c;
  }

  private fit(c: PageNode) {
    c.w = Math.min(this.spread ? (this.f.W - GAP) / 2 : this.f.W, this.f.H * c.a);
    c.el.style.width = `${c.w.toFixed(1)}px`; c.el.style.height = `${(c.w / c.a).toFixed(1)}px`;
  }
  /** Lugar da página no livro aberto: 0 = atual, 1 = anterior (ao lado, no sentido de leitura). */
  private slotX(c: PageNode, slot: 0 | 1) {
    if (!this.spread) return 0;
    const d = c.w / 2 + GAP / 2;
    return this.f.rtl === (slot === 0) ? -d : d;
  }
  private place(c: PageNode, x: number) { c.el.style.translate = `calc(-50% + ${x.toFixed(1)}px) -50%`; }

  private layer(L: Layer, r: number, grow: boolean) {
    const key = r.toFixed(3) + (grow ? 'g' : 'f');
    if (key === L.key) return;
    L.key = key;
    if (r <= 0.003) { L.el.style.visibility = 'hidden'; return; }
    const st = L.el.style;
    st.visibility = 'visible';
    st.clipPath = clipPolygon(grow && r < 1 ? growQ(L.q, r) : L.q);
    halftone(st, r);
    L.im.style.transform = grow && r < 1 && prefs.motion ? `scale(${(1.045 - 0.045 * r).toFixed(4)})` : '';
  }
  private highlight(c: PageNode, q: number[], o: number) {
    if (o <= 0.01) { c.hl.style.opacity = '0'; return; }
    const pts = svgPoints(q.map((v) => +v.toFixed(2)));
    c.po.setAttribute('points', pts); c.pi.setAttribute('points', pts); c.hl.style.opacity = o.toFixed(3);
  }

  /** Câmera que aproxima do quadro sem cortá-lo; a página só sai da tela quando precisa. */
  private cam(c: PageNode, q: Quad, xOff: number): Cam {
    const { W, H } = this.f, pw = c.w, ph = c.w / c.a, x0 = W / 2 + xOff - pw / 2, y0 = H / 2 - ph / 2, b = qbox(q), page = this.doc.book.pages[c.idx];
    const bx = x0 + (b[0] / 100) * pw, by = y0 + (b[1] / 100) * ph, bw = Math.max(1, ((b[2] - b[0]) / 100) * pw), bh = Math.max(1, ((b[3] - b[1]) / 100) * ph);
    let s = Math.min((W * 0.97) / bw, (H * 0.97) / bh, (((b[2] - b[0]) / 100) * page.w * maxScale()) / bw);
    if (this.zoom() === 'soft') s = Math.min(s, 1.6);
    s = Math.max(1, s);
    const axis = (lo: number, len: number, view: number, ctr: number) => (len * s <= view ? view / 2 - (lo + len / 2) * s : clamp(view / 2 - ctr * s, view - (lo + len) * s, -lo * s));
    return { s, tx: axis(x0, pw, W, bx + bw / 2), ty: axis(y0, ph, H, by + bh / 2) };
  }
  private setCam(c: Cam | null) {
    const v = c && Math.abs(c.s - 1) + Math.abs(c.tx) + Math.abs(c.ty) > 0.01 ? `translate(${c.tx.toFixed(1)}px,${c.ty.toFixed(1)}px) scale(${c.s.toFixed(4)})` : '';
    if (v !== this.camKey) { this.camKey = v; this.root.style.transform = v; }
  }
}

const mix = (a: Cam, b: Cam, t: number): Cam => ({ s: Math.exp(Math.log(a.s) + (Math.log(b.s) - Math.log(a.s)) * t), tx: a.tx + (b.tx - a.tx) * t, ty: a.ty + (b.ty - a.ty) * t });
