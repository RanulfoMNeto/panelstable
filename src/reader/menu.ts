import { $, $$, press } from '../core/dom';
import { EFFECTS, prefs, resetPrefs, setPref, setPrefs, type Prefs } from '../core/prefs';

export interface MenuActions {
  library(): void;
  toggleMark(): void;
  goMark(page: number, panel: number): void;
  delMark(page: number, panel: number): void;
  goScene(s: number): void;
  setDir(dir: 'rtl' | 'ltr'): void;
  dir(): 'rtl' | 'ltr';
}

/** Menu de ajustes: abre/fecha e liga cada botão a um ajuste. */
export class Menu {
  readonly el = $('#menu');
  private toggles = $$('[data-menu]');

  constructor(private act: MenuActions) {
    this.toggles.forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); this.isOpen ? this.close() : this.open(); }));
    // toque fora fecha o menu e não vira "avançar"
    document.addEventListener('pointerdown', (e) => {
      const t = e.target as Element;
      if (this.isOpen && !this.el.contains(t) && !t.closest('[data-menu]')) { this.close(); this.swallowClick(); }
    }, true);
    this.el.addEventListener('wheel', (e) => e.stopPropagation());
    this.el.addEventListener('touchmove', (e) => e.stopPropagation(), { passive: true });

    $('#mClose').onclick = () => this.close();
    $('#mLib').onclick = () => { this.close(); act.library(); };
    $$('[data-pick]', this.el).forEach((b) => b.addEventListener('click', () => this.close())); // o seletor de arquivo abre pelo main
    $$('[data-mark]').forEach((b) => b.addEventListener('click', () => act.toggleMark()));
    $('#marks').addEventListener('click', (e) => {
      const b = (e.target as Element).closest<HTMLElement>('[data-go],[data-del]');
      if (!b) return;
      const [p, j] = (b.dataset.go || b.dataset.del)!.split(':').map(Number);
      if (b.dataset.go) { this.close(); act.goMark(p, j); } else act.delMark(p, j);
    });
    for (const ol of $$('#scenes, #mscenes')) ol.addEventListener('click', (e) => {
      const li = (e.target as Element).closest<HTMLElement>('li[data-s]');
      if (li) { this.close(); act.goScene(+li.dataset.s!); }
    });

    // grupos de escolha única: data-set="view|dir|ctx|zoom|pace"
    for (const row of $$('[data-set]', this.el)) row.addEventListener('click', (e) => {
      const b = (e.target as Element).closest<HTMLElement>('[data-val]');
      if (!b) return;
      const key = row.dataset.set!, raw = b.dataset.val!;
      if (key === 'dir') act.setDir(raw as 'rtl' | 'ltr');
      else setPref(key as keyof Prefs, (key === 'ctx' ? Number(raw) : raw) as never);
      this.sync();
      if (row.hasAttribute('data-close')) setTimeout(() => this.close(), 180); // escolhas que mudam a tela: mostra o resultado
    });
    // liga/desliga: data-flag="glitch|texture|…"
    for (const b of $$('[data-flag]', this.el)) b.addEventListener('click', () => { const k = b.dataset.flag as keyof Prefs; setPref(k, !prefs[k] as never); this.sync(); });
    $('#mFxOff').onclick = () => { setPrefs(Object.fromEntries(EFFECTS.map((k) => [k, false]))); this.sync(); };
    $('#mReset').onclick = () => { resetPrefs(); this.sync(); };
  }

  get isOpen() { return !this.el.hidden; }
  open() { this.sync(); this.el.hidden = false; this.toggles.forEach((b) => b.setAttribute('aria-expanded', 'true')); }
  close() { if (!this.isOpen) return; this.el.hidden = true; this.toggles.forEach((b) => b.setAttribute('aria-expanded', 'false')); }

  /** Reflete os ajustes atuais nos botões. */
  sync() {
    for (const row of $$('[data-set]', this.el)) {
      const key = row.dataset.set!, cur = key === 'dir' ? this.act.dir() : String(prefs[key as keyof Prefs]);
      press($$('[data-val]', row), (b) => b.dataset.val === cur);
    }
    press($$('[data-flag]', this.el), (b) => !!prefs[b.dataset.flag as keyof Prefs]);
  }

  private swallowClick() {
    const stop = (e: Event) => { e.stopPropagation(); e.preventDefault(); };
    window.addEventListener('click', stop, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 400);
  }
}
