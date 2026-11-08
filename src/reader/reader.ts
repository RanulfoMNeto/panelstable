import { readCbz } from '../core/cbz';
import { db, lastOpened } from '../core/db';
import { $, flick } from '../core/dom';
import { onPrefs, prefs, type View } from '../core/prefs';
import type { Book, Dir, Progress } from '../core/types';
import { Driver } from './driver';
import { applyEffectClasses, GlitchClock, Rain, SpeedLines } from './fx';
import { Hud } from './hud';
import { bindInput, edgeLabels, showHint } from './input';
import type { Frame } from './layout';
import { Menu } from './menu';
import { buildModel, stepAt } from './model';
import { Pagina } from './pagina';
import { Palco } from './palco';
import type { Doc, ReaderView } from './view';

const HINT_KEY = 'mesa-quadros:hint';

/** O leitor: abre um livro, conduz a leitura e guarda o histórico. */
export class Reader {
  private root = $('#reader');
  private center = $('#center');
  private doc: Doc | null = null;
  private palco: Palco | null = null;
  private pagina: Pagina | null = null;
  private progress: Progress | null = null;
  private driver = new Driver(() => this.doc?.model.steps.length ?? 0);
  private hud = new Hud();
  private rain = new Rain($('#rain') as HTMLCanvasElement);
  private speed = new SpeedLines($('#speed') as HTMLCanvasElement);
  private glitches = new GlitchClock(() => [
    () => this.palco && prefs.view === 'palco' && this.palco.glitch(),
    () => flick($('#ttl')),
    () => flick($('#pos')),
  ]);
  private menu: Menu;
  private frame: Frame = { W: 400, H: 600, rtl: true, compact: false };
  private builtView: View = prefs.view;
  private lastT = -1;
  private lastStep = -1;
  private lastFrame = 0;
  private raf = 0;
  private saveTimer = 0;
  private par = { x: 0, y: 0, tx: 0, ty: 0 };

  constructor(private onLibrary: () => void, private onOpenFile: () => void) {
    this.menu = new Menu({
      library: () => this.onLibrary(),
      open: () => this.onOpenFile(),
      toggleMark: () => this.toggleMark(),
      goMark: (p, j) => this.goTo(p, j),
      delMark: (p, j) => this.removeMark(p, j),
      goScene: (s) => { const k = this.doc?.model.steps.findIndex((st) => st.s === s && st.k !== 'full') ?? -1; if (k >= 0) this.driver.go(k); },
      setDir: (d) => this.setDir(d),
      dir: () => this.doc?.book.dir ?? 'rtl',
    });
    bindInput({
      active: () => !!this.doc && !this.root.hidden,
      blocked: () => this.menu.isOpen,
      rtl: () => this.frame.rtl,
      nudge: (d) => this.driver.nudge(d),
      step: (d) => this.driver.step(d),
      first: () => this.driver.go(0),
      last: () => this.driver.go(Infinity),
      press: (id) => id && this.palco?.press(id),
      pointer: (x, y) => { this.par.tx = x; this.par.ty = y; },
    });
    new ResizeObserver(() => this.layout()).observe(this.root);
    onPrefs(() => this.prefsChanged());
    window.addEventListener('pagehide', () => this.saveNow());
    document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && this.saveNow());
    applyEffectClasses();
  }

  get bookId() { return this.doc?.book.id ?? null; }

  /** Abre um livro na posição salva. */
  async open(book: Book) {
    const file = await db.getFile(book.id);
    if (!file) throw new Error('O arquivo desse livro não está mais salvo neste navegador.');
    const { images } = await readCbz(file);
    this.close(false);
    const urls = images.map((i) => URL.createObjectURL(i.blob));
    this.doc = { book, model: buildModel(book, prefs.view), urls };
    this.progress = await db.getProgress(book.id);
    book.opened = Date.now();
    void db.putBook(book);
    lastOpened.set(book.id);

    this.palco = new Palco(this.doc);
    this.pagina = new Pagina(this.doc);
    this.root.hidden = false;
    this.hud.setBook(book);
    this.rebuild({ page: this.progress.page, panel: this.progress.panel });
    if (!localStorage.getItem(HINT_KEY)) { showHint(book.dir === 'rtl'); try { localStorage.setItem(HINT_KEY, '1'); } catch { /* ignora */ } }
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame((t) => this.loop(t));
  }

  /** Fecha o livro (salva a posição e libera as imagens). */
  close(hide = true) {
    this.saveNow();
    cancelAnimationFrame(this.raf);
    this.palco?.clear(); this.pagina?.clear();
    this.doc?.urls.forEach((u) => URL.revokeObjectURL(u));
    this.doc = null; this.palco = null; this.pagina = null;
    this.menu.close();
    if (hide) { this.root.hidden = true; lastOpened.set(null); }
  }

  private get view(): ReaderView | null { return prefs.view === 'palco' ? this.palco : this.pagina; }

  /** Recria os passos (troca de modo ou de sentido) mantendo a posição. */
  private rebuild(at?: { page: number; panel: number }) {
    if (!this.doc) return;
    const cur = at ?? this.position();
    this.doc.model = buildModel(this.doc.book, prefs.view);
    this.builtView = prefs.view;
    this.palco!.clear(); this.pagina!.clear();
    this.palco!.show(prefs.view === 'palco'); this.pagina!.show(prefs.view === 'pagina');
    this.hud.setScenes(this.doc.model, this.progress!, this.doc.book);
    this.hud.setMarks(this.progress!.marks, this.doc.book);
    edgeLabels(this.doc.book.dir === 'rtl');
    this.layout();
    this.driver.jump(stepAt(this.doc.model.steps, cur.page, cur.panel));
    this.lastT = -1; this.lastStep = -1;
  }

  private layout() {
    if (!this.doc) return;
    const r = this.root.getBoundingClientRect();
    const compact = r.width < 700 || r.height < 520 || r.width / r.height < 1;
    this.root.classList.toggle('compact', compact);
    if (!compact) this.hud.fitTitle();
    const c = this.center.getBoundingClientRect();
    this.frame = { W: Math.max(120, c.width), H: Math.max(120, c.height), rtl: this.doc.book.dir === 'rtl', compact };
    this.rain.size(c.width, c.height);
    this.speed.size(c.width, c.height);
    this.palco?.layout(this.frame); this.pagina?.layout(this.frame);
    this.lastT = -1;
  }

  private prefsChanged() {
    applyEffectClasses();
    if (!this.doc) return;
    if (prefs.view !== this.builtView) this.rebuild();
    else { this.palco?.refresh(); this.pagina?.refresh(); this.layout(); this.lastStep = -1; }
  }

  private setDir(dir: Dir) {
    if (!this.doc || this.doc.book.dir === dir) return;
    this.doc.book.dir = dir;
    void db.putBook(this.doc.book);
    this.hud.setBook(this.doc.book);
    this.rebuild();
    showHint(dir === 'rtl');
    this.menu.sync();
  }

  private loop(now: number) {
    this.raf = requestAnimationFrame((t) => this.loop(t));
    const doc = this.doc, view = this.view;
    if (!doc || !view || !doc.model.steps.length) return;
    const dt = this.lastFrame ? (now - this.lastFrame) / 1000 : 0.016;
    this.lastFrame = now;
    const t = this.driver.update(dt), speed = this.lastT < 0 ? 0 : Math.abs(t - this.lastT);
    if (t !== this.lastT) { view.render(t); this.lastT = t; }
    const k = Math.round(t);
    if (k !== this.lastStep) { this.lastStep = k; this.onStep(k); }
    this.speed.draw(speed, prefs.view === 'palco');
    const still = prefs.motion ? 1 : 0;
    this.par.x += (this.par.tx * still - this.par.x) * 0.06; this.par.y += (this.par.ty * still - this.par.y) * 0.06;
    if (prefs.view === 'palco') this.palco?.alive(now / 1000, Math.min(0.05, dt), this.par);
    this.glitches.tick(now);
    this.rain.draw(now);
  }

  /** Chegou num passo: atualiza a interface e o histórico. */
  private onStep(k: number) {
    const doc = this.doc!, st = doc.model.steps[k], pr = this.progress!;
    if (!st) return;
    pr.page = st.p; pr.panel = Math.max(0, st.j); pr.at = Date.now();
    if (!pr.read.includes(st.p)) pr.read.push(st.p);
    this.hud.update(doc, k, this.frame.compact, this.isMarked());
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => this.saveNow(), 500);
  }

  private position() { return { page: this.progress?.page ?? 0, panel: this.progress?.panel ?? 0 }; }
  private saveNow() { if (this.doc && this.progress) { clearTimeout(this.saveTimer); void db.putProgress(this.doc.book.id, this.progress); } }

  private goTo(page: number, panel: number) { if (this.doc) this.driver.go(stepAt(this.doc.model.steps, page, panel)); }
  private isMarked() { const p = this.progress; return !!p && p.marks.some((m) => m.page === p.page && m.panel === p.panel); }
  private toggleMark() {
    const p = this.progress, doc = this.doc;
    if (!p || !doc) return;
    if (this.isMarked()) p.marks = p.marks.filter((m) => !(m.page === p.page && m.panel === p.panel));
    else p.marks.push({ page: p.page, panel: p.panel, at: Date.now() });
    this.hud.setMarked(this.isMarked());
    this.hud.setMarks(p.marks, doc.book);
    this.saveNow();
  }
  private removeMark(page: number, panel: number) {
    const p = this.progress;
    if (!p || !this.doc) return;
    p.marks = p.marks.filter((m) => !(m.page === page && m.panel === panel));
    this.hud.setMarks(p.marks, this.doc.book); this.hud.setMarked(this.isMarked());
    this.saveNow();
  }
}

