export const SVG_NS = 'http://www.w3.org/2000/svg';

export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;
export const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll(sel)] as T[];

/** Cria um elemento com classe e filhos. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', ...kids: (Node | string)[]) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  el.append(...kids);
  return el;
}

/** Cria um elemento SVG com atributos. */
export function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string> = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}

export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

let toastTimer = 0;
/** Aviso curto no rodapé. */
export function toast(msg: string, ms = 3600) {
  const el = $('#toast');
  el.textContent = msg; el.hidden = false; el.style.opacity = '1';
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { el.style.opacity = '0'; setTimeout(() => (el.hidden = true), 420); }, ms);
}

/** Tela de espera com barra de progresso (0–1). `null` esconde. */
export function busy(text: string | null, progress = 0) {
  const el = $('#busy');
  if (text === null) { el.hidden = true; return; }
  el.hidden = false; $('#busyT').textContent = text; $('#busyBar').style.width = `${Math.round(progress * 100)}%`;
}

const flickTimers = new WeakMap<Element, number>();
/** Liga a classe .on por um instante (glitch de fatias nos textos .gl). */
export function flick(el: Element | null) {
  if (!el) return;
  el.classList.remove('on'); void (el as HTMLElement).offsetWidth; el.classList.add('on');
  clearTimeout(flickTimers.get(el));
  flickTimers.set(el, window.setTimeout(() => el.classList.remove('on'), 360));
}

/** Atualiza aria-pressed de um grupo de botões. */
export const press = (btns: Element[], on: (b: HTMLElement) => boolean) => btns.forEach((b) => b.setAttribute('aria-pressed', String(on(b as HTMLElement))));
