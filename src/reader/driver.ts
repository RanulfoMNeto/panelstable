import { clamp } from '../core/math';
import { paceRate } from '../core/prefs';

/**
 * "Rolagem" virtual: roda, toque e teclas mexem um alvo; a posição segue o alvo com uma mola.
 * Um gesto avança no máximo um passo, e ao soltar o alvo assenta num passo inteiro.
 */
export class Driver {
  private target = 0;
  private cur = 0;
  private anchor = 0;
  private dir = 1;
  private gesture = false;
  private idle = 0;
  constructor(private count: () => number) {}

  private get max() { return Math.max(0, this.count() - 1); }

  nudge(d: number) {
    if (!this.gesture) { this.anchor = Math.round(this.cur); this.gesture = true; }
    if (d) this.dir = Math.sign(d);
    this.target = clamp(this.target + d, Math.max(0, this.anchor - 1), Math.min(this.max, this.anchor + 1));
    clearTimeout(this.idle);
    this.idle = window.setTimeout(() => this.settle(), 170);
  }
  go(k: number) { clearTimeout(this.idle); this.gesture = false; this.target = clamp(Math.round(k), 0, this.max); }
  step(d: number) { this.go(Math.round(this.target) + d); }
  jump(k: number) { this.go(k); this.cur = this.target; }
  /** Avança a mola; dt em segundos. Retorna a posição atual (fracionária durante a transição). */
  update(dt: number) {
    const d = this.target - this.cur;
    this.cur = Math.abs(d) < 0.0004 ? this.target : this.cur + d * (1 - Math.exp(-paceRate() * Math.min(0.1, dt)));
    return this.cur;
  }
  get at() { return Math.round(this.target); }

  private settle() {
    this.gesture = false;
    const fl = Math.floor(this.target), fr = this.target - fl;
    let k = fl;
    if (fr > 1e-4) k = this.dir > 0 ? (fr > 0.16 ? fl + 1 : fl) : fr < 0.84 ? fl : fl + 1;
    this.target = clamp(k, 0, this.max);
  }
}
