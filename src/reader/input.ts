import { $ } from '../core/dom';
import { clamp } from '../core/math';

export interface InputTarget {
  /** está lendo (leitor visível e com livro)? */
  active(): boolean;
  /** menu aberto bloqueia gestos */
  blocked(): boolean;
  rtl(): boolean;
  nudge(d: number): void;
  step(d: number): void;
  first(): void;
  last(): void;
  /** clique/toque num quadro (efeito de aperto) */
  press(id: string | null): void;
  /** movimento do ponteiro, de -1 a 1 em cada eixo (paralaxe) */
  pointer(x: number, y: number): void;
}

/**
 * Entradas do leitor. Regra única para clicar/tocar: a metade da tela para onde a leitura vai avança,
 * a outra volta (mangá: esquerda avança, direita volta). Teclas e arrastar seguem o mesmo sentido.
 */
export function bindInput(t: InputTarget) {
  const reader = $('#reader'), center = $('#center'), edgeL = $('#edgeL'), edgeR = $('#edgeR');
  const forwardSide = (x: number) => { const r = center.getBoundingClientRect(); return (x - r.left < r.width / 2) === t.rtl(); };

  reader.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (t.blocked()) return;
    let d = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    if (e.deltaMode === 1) d *= 16; else if (e.deltaMode === 2) d *= window.innerHeight;
    t.nudge(d * 0.0022);
  }, { passive: false });

  let start: { x: number; y: number } | null = null, last = { x: 0, y: 0 }, axis: 'x' | 'y' | null = null, moved = 0;
  reader.addEventListener('touchstart', (e) => { hideHint(); const p = e.touches[0]; start = last = { x: p.clientX, y: p.clientY }; axis = null; moved = 0; }, { passive: true });
  reader.addEventListener('touchmove', (e) => {
    if (!start || t.blocked()) return;
    const p = e.touches[0], dx = p.clientX - last.x, dy = p.clientY - last.y;
    last = { x: p.clientX, y: p.clientY }; moved += Math.abs(dx) + Math.abs(dy);
    if (!axis && Math.hypot(p.clientX - start.x, p.clientY - start.y) > 10) axis = Math.abs(p.clientX - start.x) > Math.abs(p.clientY - start.y) ? 'x' : 'y';
    if (axis === 'y') t.nudge(-dy * 0.0055);
    else if (axis === 'x') t.nudge((t.rtl() ? dx : -dx) * 0.0045);
    if (e.cancelable) e.preventDefault();
  }, { passive: false });
  reader.addEventListener('touchend', () => (start = null), { passive: true });

  center.addEventListener('click', (e) => {
    hideHint();
    if (moved > 10) { moved = 0; return; }
    ripple(center, e);
    const it = (e.target as Element).closest?.<HTMLElement>('.it');
    t.press(it?.dataset.id ?? null);
    t.step(forwardSide(e.clientX) ? 1 : -1);
  });

  center.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    const fwd = forwardSide(e.clientX), left = fwd === t.rtl();
    edgeL.classList.toggle('on', left); edgeR.classList.toggle('on', !left);
  });
  center.addEventListener('pointerleave', () => { edgeL.classList.remove('on'); edgeR.classList.remove('on'); });
  reader.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    const r = center.getBoundingClientRect();
    t.pointer(clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1), clamp(((e.clientY - r.top) / r.height) * 2 - 1, -1, 1));
  });
  reader.addEventListener('pointerleave', () => t.pointer(0, 0));

  window.addEventListener('keydown', (e) => {
    if (!t.active() || t.blocked()) return;
    const el = e.target as HTMLElement;
    if (/^(input|textarea|select)$/i.test(el.tagName) || (el.closest('button') && (e.key === ' ' || e.key === 'Enter'))) return;
    const fwd = t.rtl() ? 'ArrowLeft' : 'ArrowRight', back = t.rtl() ? 'ArrowRight' : 'ArrowLeft';
    if ([fwd, 'ArrowDown', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); t.step(1); }
    else if ([back, 'ArrowUp', 'PageUp'].includes(e.key)) { e.preventDefault(); t.step(-1); }
    else if (e.key === 'Home') t.first();
    else if (e.key === 'End') t.last();
  });
}

/** Rótulos das setas de borda conforme o sentido. */
export function edgeLabels(rtl: boolean) {
  $('#edgeL span').textContent = rtl ? '次へ' : '戻る';
  $('#edgeR span').textContent = rtl ? '戻る' : '次へ';
}

let hintTimer = 0;
/** Mostra rapidamente as duas metades da tela (some sozinha ou no primeiro toque). */
export function showHint(rtl: boolean) {
  $('#zones')?.remove();
  const z = document.createElement('div');
  z.className = 'zones'; z.id = 'zones'; z.setAttribute('aria-hidden', 'true');
  const next = '<p><i>次へ</i>toque para avançar</p>', back = '<p><i>戻る</i>toque para voltar</p>';
  z.innerHTML = rtl ? next + back : back + next;
  $('#center').append(z);
  clearTimeout(hintTimer);
  hintTimer = window.setTimeout(hideHint, 2400);
}
export function hideHint() {
  const z = $('#zones');
  if (!z) return;
  clearTimeout(hintTimer);
  z.classList.add('out');
  setTimeout(() => z.remove(), 650);
}

function ripple(host: HTMLElement, e: MouseEvent) {
  const r = host.getBoundingClientRect(), el = document.createElement('span');
  el.className = 'rip';
  el.style.left = `${Math.round(e.clientX - r.left)}px`; el.style.top = `${Math.round(e.clientY - r.top)}px`;
  host.append(el);
  el.addEventListener('animationend', () => el.remove());
  setTimeout(() => el.remove(), 800); // sem animação (movimento reduzido), some igual
}
