import { $, svg } from '../core/dom';
import { clamp, clamp01, ease, halftone, lerpArr } from '../core/math';
import { imageFilter, prefs } from '../core/prefs';
import { compose, emptyRect, fitIn, geometry, type Box, type Frame, type Geo } from './layout';
import { sceneLabel, type Item } from './model';
import type { Doc, ReaderView } from './view';

type Role = 'hero' | 'sup' | 'full';
interface Slot { it: Item; b: Box; role: Role; dim: number }
interface State { m: Map<string, Slot>; ghost: { text: string; r: Box } | null }
interface Node {
  w: HTMLDivElement; el: HTMLDivElement; cam: HTMLDivElement; im: HTMLImageElement; po: SVGPolygonElement; po2: SVGPolygonElement;
  g: Geo; key: string; on: boolean; role: Role; dim: number; b: Box;
  hov: number; hovV: number; prs: number; prsV: number; ph: number; tf: string; bri: string; hl: boolean;
}

/** Palco: o quadro atual em destaque e os já lidos da mesma página numa faixa. */
export class Palco implements ReaderView {
  private root = $('#stage');
  private ghostEl = $('#ghost');
  private nodes = new Map<string, Node>();
  private geo = new Map<string, Geo>();
  private states = new Map<number, State>();
  private f: Frame = { W: 400, H: 600, rtl: true, compact: false };
  private ghostKey = '';
  private ghostOn = false;
  hoverId: string | null = null;

  constructor(private doc: Doc) {
    this.root.addEventListener('pointermove', (e) => {
      const it = (e.target as Element).closest?.('.it') as HTMLElement | null;
      this.hoverId = it && e.pointerType !== 'touch' ? it.dataset.id! : null;
    });
    this.root.addEventListener('pointerleave', () => (this.hoverId = null));
  }

  show(on: boolean) { this.root.hidden = !on; }
  layout(f: Frame) { this.f = f; this.states.clear(); this.ghostKey = ''; this.nodes.forEach((n) => (n.key = '')); }
  clear() { this.nodes.forEach((n) => n.w.remove()); this.nodes.clear(); this.geo.clear(); this.states.clear(); this.setGhost(null, null, null, 0); }
  refresh() { this.states.clear(); this.nodes.forEach((n) => { n.key = ''; n.im.style.filter = imageFilter(this.doc.book.pages[+n.el.dataset.p!].color); }); }

  /** Aperta o quadro sob o dedo/ponteiro (efeito de mola). */
  press(id: string) { const n = this.nodes.get(id); if (n) { n.prs = 0.955; n.prsV = 0; } }
  /** Glitch rápido no quadro em destaque. */
  glitch() { for (const n of this.nodes.values()) if (n.on && n.role === 'hero') { n.w.classList.add('gl'); setTimeout(() => n.w.classList.remove('gl'), 300); } }

  render(t: number) {
    const steps = this.doc.model.steps, k = Math.min(steps.length - 1, Math.floor(t)), f = k >= steps.length - 1 ? 0 : t - k;
    const A = this.state(k), B = f > 0 ? this.state(k + 1) : A;
    const ids = new Set([...A.m.keys(), ...B.m.keys()]), dirS = this.f.rtl ? 1 : -1;
    this.nodes.forEach((n, id) => { if (!ids.has(id)) this.hide(n); });
    for (const id of ids) {
      const a = A.m.get(id), b = B.m.get(id), n = this.node((b || a)!.it);
      const late = b && b.role === 'hero' && (!a || a.role !== 'hero') ? 0.14 : 0;
      const e = f > 0 ? ease(clamp01((f - late) / 0.86)) : 0;
      // quem entra vem do lado onde a leitura começa; quem sai segue para onde ela termina
      if (a && b) this.apply(n, lerpArr(a.b, b.b, e), 1, e > 0.5 ? b.role : a.role, a.dim + (b.dim - a.dim) * e);
      else if (a) { const x = ease(f); this.apply(n, [a.b[0] - dirS * x * 28, a.b[1], a.b[2], a.b[3]], 1 - x, a.role, a.dim); }
      else if (b) this.apply(n, [b.b[0] + dirS * (1 - e) * 28, b.b[1], b.b[2], b.b[3]], e, b.role, b.dim, 0.3 + 0.7 * e);
    }
    const ga = prefs.ghost ? A.ghost : null, gb = prefs.ghost ? B.ghost : null, e = ease(f);
    if (ga && gb && ga.text === gb.text) this.setGhost(ga.text, lerpArr(ga.r, gb.r, e), gb.r, 1);
    else if (f < 0.5) this.setGhost(ga?.text ?? null, ga?.r ?? null, ga?.r ?? null, ga ? 1 - ease(f * 2) : 0);
    else this.setGhost(gb?.text ?? null, gb?.r ?? null, gb?.r ?? null, gb ? ease(f * 2 - 1) : 0);
  }

  /** Vida mesmo parado: o destaque respira, os lidos flutuam, tudo segue o ponteiro de leve; hover e clique com mola. */
  alive(T: number, dt: number, par: { x: number; y: number }) {
    const still = prefs.motion ? 1 : 0;
    for (const [id, n] of this.nodes) {
      if (!n.on) continue;
      spring(n, 'hov', this.hoverId === id ? 1 : 0, 140, 17, dt);
      spring(n, 'prs', 1, 320, 13, dt);
      const hero = n.role === 'hero', depth = hero ? 7 : n.role === 'sup' ? 3.5 : 4;
      const breathe = hero ? 1 + 0.007 * Math.sin(T * 0.95) * still : 1;
      const tx = (par.x * depth + (hero ? 0 : Math.sin(T * 0.45 + n.ph) * 1.4)) * still;
      const ty = (par.y * depth + (hero ? Math.sin(T * 0.6) * 1.2 : Math.cos(T * 0.37 + n.ph) * 1.2)) * still;
      const tf = `translate(${tx.toFixed(1)}px,${ty.toFixed(1)}px) scale(${(breathe * (1 + 0.014 * n.hov) * n.prs).toFixed(4)})`;
      if (tf !== n.tf) { n.tf = tf; n.w.style.transform = tf; }
      const hl = n.hov > 0.5; if (hl !== n.hl) { n.hl = hl; n.w.classList.toggle('hov', hl); }
      const bri = n.dim < 1 ? `brightness(${(n.dim + (1 - n.dim) * clamp01(n.hov)).toFixed(3)})` : '';
      if (bri !== n.bri) { n.bri = bri; n.cam.style.filter = bri; }
    }
    if (this.ghostOn && still) this.ghostEl.style.transform = `translate(${(-par.x * 10 + Math.sin(T * 0.3) * 6).toFixed(1)}px,${(-par.y * 8 + Math.cos(T * 0.23) * 4).toFixed(1)}px)`;
  }
  ghostVisible() { return this.ghostOn; }

  /** Composição de um passo (memorizada até mudar o tamanho da tela ou o livro). */
  private state(k: number): State {
    const hit = this.states.get(k);
    if (hit) return hit;
    const { steps, scenes } = this.doc.model, st = steps[k], m = new Map<string, Slot>();
    let ghost: State['ghost'] = null;
    if (st?.k === 'panel') {
      const sc = scenes[st.s], it = sc.items[st.i], prev: Item[] = [];
      for (let n = st.i - 1; n >= 0 && prev.length < prefs.ctx && sc.items[n].p === it.p; n--) prev.unshift(sc.items[n]);
      const c = compose(this.g(it), prev.map((p) => this.g(p)), this.f);
      m.set(it.id, { it, b: c.hero, role: 'hero', dim: 1 });
      c.sups.forEach((b, n) => m.set(prev[n].id, { it: prev[n], b, role: 'sup', dim: 0.82 }));
      const free = emptyRect([...c.sups, c.hero], this.f.W, this.f.H, c.gap * 1.5, Math.min(this.f.W, this.f.H) * 0.16);
      if (free && free[2] * free[3] >= this.f.W * this.f.H * 0.1) ghost = { text: /^cena \d+$/i.test(sc.name) ? String(st.s + 1).padStart(2, '0') : sceneLabel(sc), r: free };
    } else if (st) {
      const it: Item = { id: `${st.p}:F`, p: st.p, j: -1, q: [0, 0, 100, 0, 100, 100, 0, 100] };
      m.set(it.id, { it, b: fitIn(this.g(it), 0, 0, this.f.W, this.f.H), role: 'full', dim: 1 });
    }
    const s = { m, ghost };
    this.states.set(k, s);
    return s;
  }

  private g(it: Item) {
    let g = this.geo.get(it.id);
    if (!g) { g = geometry(it, this.doc.book.pages[it.p]); this.geo.set(it.id, g); }
    return g;
  }

  private node(it: Item): Node {
    let n = this.nodes.get(it.id);
    if (n) return n;
    const page = this.doc.book.pages[it.p];
    const w = document.createElement('div'); w.className = 'w'; w.style.display = 'none';
    const el = document.createElement('div'); el.className = 'it'; el.dataset.id = it.id; el.dataset.p = String(it.p);
    const cam = document.createElement('div'); cam.className = 'cam';
    const im = new Image(); im.src = this.doc.urls[it.p]; im.alt = ''; im.draggable = false; im.decoding = 'async'; im.style.filter = imageFilter(page.color);
    cam.append(im); el.append(cam);
    const fr = svg('svg', { class: 'fr', viewBox: '0 0 100 100', preserveAspectRatio: 'none', 'aria-hidden': 'true' });
    const po2 = svg('polygon', { class: 'f2' }), po = svg('polygon');
    fr.append(po2, po); w.append(el, fr); this.root.append(w);
    n = { w, el, cam, im, po, po2, g: this.g(it), key: '', on: false, role: 'sup', dim: 1, b: [0, 0, 1, 1], hov: 0, hovV: 0, prs: 1, prsV: 0, ph: Math.random() * 6.283, tf: '', bri: '', hl: false };
    this.nodes.set(it.id, n);
    return n;
  }

  private hide(n: Node) { if (n.on) { n.w.style.display = 'none'; n.on = false; } n.key = ''; }

  private apply(n: Node, B: Box, v: number, role: Role, dim: number, rev = 1) {
    n.role = role; n.dim = dim; n.b = B;
    const { W, H, rtl } = this.f;
    const key = `${B.map((x) => x.toFixed(1)).join(',')}|${v.toFixed(3)}|${role}|${rev.toFixed(3)}|${W}x${H}`;
    if (key === n.key) return;
    n.key = key;
    if (v <= 0.003) { this.hide(n); n.key = key; return; }
    if (!n.on) { n.w.style.display = ''; n.on = true; }
    const [bx, by, bw, bh] = B, { shape, crop } = n.g;
    // o recorte é o contorno do próprio quadro; ao entrar, revela no sentido de leitura
    const q: number[] = [];
    for (let i = 0; i < 8; i += 2) {
      const nx = rev >= 1 ? shape[i] : rtl ? 1 - (1 - shape[i]) * rev : shape[i] * rev;
      q.push(((bx + nx * bw) / W) * 100, ((by + shape[i + 1] * bh) / H) * 100);
    }
    const s = q.map((x) => x.toFixed(2)), st = n.el.style;
    st.clipPath = `polygon(${s[0]}% ${s[1]}%,${s[2]}% ${s[3]}%,${s[4]}% ${s[5]}%,${s[6]}% ${s[7]}%)`;
    halftone(st, v);
    const page = this.doc.book.pages[+n.el.dataset.p!], sc = bw / crop[2], im = n.im.style;
    im.width = `${(page.w * sc).toFixed(1)}px`; im.height = `${(page.h * sc).toFixed(1)}px`;
    im.left = `${(bx - crop[0] * sc).toFixed(1)}px`; im.top = `${(by - crop[1] * sc).toFixed(1)}px`;
    n.w.style.transformOrigin = `${(bx + bw / 2).toFixed(0)}px ${(by + bh / 2).toFixed(0)}px`;
    n.w.style.zIndex = role === 'hero' ? '3' : role === 'sup' ? '2' : '1';
    n.po.setAttribute('points', `${s[0]},${s[1]} ${s[2]},${s[3]} ${s[4]},${s[5]} ${s[6]},${s[7]}`);
    n.po.setAttribute('class', role === 'hero' ? 'hero' : '');
    n.po.style.strokeOpacity = v.toFixed(3);
    if (role !== 'hero') { n.po2.style.display = 'none'; return; }
    // segunda moldura 7 px por fora, acompanhando o formato do quadro
    const cx = bx + bw / 2, cy = by + bh / 2, o: string[] = [];
    for (let i = 0; i < 8; i += 2) {
      const x = (q[i] / 100) * W, y = (q[i + 1] / 100) * H;
      o.push(((clamp(x + Math.sign(x - cx) * 7, 0, W) / W) * 100).toFixed(2), ((clamp(y + Math.sign(y - cy) * 7, 0, H) / H) * 100).toFixed(2));
    }
    n.po2.style.display = ''; n.po2.setAttribute('points', `${o[0]},${o[1]} ${o[2]},${o[3]} ${o[4]},${o[5]} ${o[6]},${o[7]}`); n.po2.style.strokeOpacity = (v * 0.9).toFixed(3);
  }

  /** Nome da cena (ou número) vazado e enorme no espaço que sobra. */
  private setGhost(text: string | null, r: Box | null, fin: Box | null, op: number) {
    const el = this.ghostEl;
    if (!text || !r || !fin || op <= 0.01) { this.ghostOn = false; if (el.style.opacity !== '0') el.style.opacity = '0'; return; }
    const key = `${text}|${Math.round(fin[2] / 8)}x${Math.round(fin[3] / 8)}`;
    if (key !== this.ghostKey) {
      this.ghostKey = key; el.textContent = text;
      el.style.width = `${fin[2].toFixed(0)}px`; el.style.height = `${fin[3].toFixed(0)}px`;
      let fs = Math.min(fin[3] * 0.82, fin[2] * (text.length <= 3 ? 0.62 : 0.5));
      el.style.fontSize = `${fs}px`;
      for (let i = 0; i < 30 && fs > 14 && (el.scrollWidth > fin[2] + 1 || el.scrollHeight > fin[3] + 1); i++) { fs *= 0.9; el.style.fontSize = `${fs}px`; }
    }
    el.style.translate = `${r[0].toFixed(1)}px ${r[1].toFixed(1)}px`;
    el.style.width = `${r[2].toFixed(0)}px`; el.style.height = `${r[3].toFixed(0)}px`;
    el.style.opacity = (op * 0.6).toFixed(3);
    this.ghostOn = op > 0.05;
  }
}

/** Mola amortecida para hover (hov) e aperto (prs). */
function spring(n: Node, k: 'hov' | 'prs', target: number, stiff: number, damp: number, dt: number) {
  const v = (k === 'hov' ? n.hovV : n.prsV) + (stiff * (target - n[k]) - damp * (k === 'hov' ? n.hovV : n.prsV)) * dt;
  if (k === 'hov') n.hovV = v; else n.prsV = v;
  n[k] = clamp(n[k] + v * dt, -1, 2);
}
