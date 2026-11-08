import { prefs } from '../core/prefs';

/** Textura: um ladrilho de grão com linhas de varredura, gerado uma vez e movido só pelo compositor. */
export function mountTexture() {
  const N = 180, cv = Object.assign(document.createElement('canvas'), { width: N, height: N });
  const ctx = cv.getContext('2d')!, img = ctx.createImageData(N, N), d = img.data;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = (y * N + x) * 4, v = Math.random();
    d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = (v * v * 40 + (y % 3 === 0 ? 9 : 0)) | 0;
  }
  ctx.putImageData(img, 0, 0);
  const grain = Object.assign(document.createElement('div'), { className: 'grain' });
  grain.style.backgroundImage = `url(${cv.toDataURL()})`;
  const sweep = Object.assign(document.createElement('div'), { className: 'sweep' });
  for (const el of [grain, sweep]) { el.setAttribute('aria-hidden', 'true'); document.body.append(el); }
}

/** Liga/desliga as classes globais de efeito conforme os ajustes. */
export function applyEffectClasses() {
  const c = document.documentElement.classList;
  c.toggle('no-texture', !prefs.texture);
  c.toggle('no-rain', !prefs.rain);
  c.toggle('no-motion', !prefs.motion);
}

/** Chuva de katakana bem apagada, visível só nos vãos entre os quadros. ~12 quadros por segundo. */
export class Rain {
  private ctx: CanvasRenderingContext2D;
  private W = 1; private H = 1; private last = 0; private drawn = false;
  private cols: { x: number; y: number; v: number; on: boolean; n: number; seed: number }[] = [];
  private static CH = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789';
  private static FS = 14;
  constructor(private cv: HTMLCanvasElement) { this.ctx = cv.getContext('2d')!; }

  size(W: number, H: number) {
    this.W = Math.max(1, W); this.H = Math.max(1, H);
    this.cv.width = Math.round(this.W); this.cv.height = Math.round(this.H);
    const fs = Rain.FS;
    this.cols = Array.from({ length: Math.ceil(this.W / (fs * 1.6)) }, (_, i) => ({ x: i * fs * 1.6 + 4, y: Math.random() * this.H, v: 6 + Math.random() * 16, on: Math.random() < 0.55, n: 6 + ((Math.random() * 14) | 0), seed: Math.random() * 999 }));
    this.last = 0;
  }

  draw(now: number) {
    if (now - this.last < 83) return;
    const dt = this.last ? Math.min(0.2, (now - this.last) / 1000) : 0;
    this.last = now;
    const { ctx, W, H } = this, fs = Rain.FS, CH = Rain.CH;
    if (!prefs.rain) { if (this.drawn) { ctx.clearRect(0, 0, W, H); this.drawn = false; } return; }
    ctx.clearRect(0, 0, W, H); this.drawn = true;
    ctx.font = `400 ${fs}px "DotGothic16", monospace`; ctx.textBaseline = 'top';
    for (const c of this.cols) {
      if (!c.on) continue;
      c.y += c.v * dt;
      if (c.y - c.n * fs > H) { c.y = -fs * 2; c.on = Math.random() < 0.55; c.seed = Math.random() * 999; }
      for (let k = 0; k < c.n; k++) {
        const y = c.y - k * fs;
        if (y < -fs || y > H) continue;
        const ch = CH[(((Math.floor(c.seed + k * 7 + (k === 0 ? now / 180 : 0)) % CH.length) + CH.length) % CH.length)];
        ctx.fillStyle = k === 0 ? 'rgba(255,46,77,.22)' : `rgba(243,242,238,${(0.07 * (1 - k / c.n)).toFixed(3)})`;
        ctx.fillText(ch, c.x, y);
      }
    }
  }
}

/** Linhas de velocidade: aparecem no fundo enquanto os quadros se movem. */
export class SpeedLines {
  private ctx: CanvasRenderingContext2D;
  private on = false;
  private rays = Array.from({ length: 70 }, () => ({ a: Math.random() * Math.PI * 2, r0: 0.42 + Math.random() * 0.25, w: 0.4 + Math.random() * 1.6, l: 0.2 + Math.random() * 0.5 }));
  constructor(private cv: HTMLCanvasElement) { this.ctx = cv.getContext('2d')!; }

  size(W: number, H: number) { this.cv.width = Math.max(1, Math.round(W * 0.6)); this.cv.height = Math.max(1, Math.round(H * 0.6)); }

  draw(speed: number, enabled: boolean) {
    const { ctx, cv } = this, W = cv.width, H = cv.height;
    if (!enabled || !prefs.speedLines || speed < 0.0015) { if (this.on) { ctx.clearRect(0, 0, W, H); this.on = false; } return; }
    this.on = true; ctx.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2, R = Math.hypot(W, H) / 2;
    ctx.strokeStyle = `rgba(243,242,238,${Math.min(0.32, speed * 9).toFixed(3)})`;
    for (const r of this.rays) {
      ctx.lineWidth = r.w; ctx.beginPath();
      ctx.moveTo(cx + Math.cos(r.a) * R * r.r0, cy + Math.sin(r.a) * R * r.r0);
      ctx.lineTo(cx + Math.cos(r.a) * R * (r.r0 + r.l), cy + Math.sin(r.a) * R * (r.r0 + r.l));
      ctx.stroke();
    }
  }
}

/** Sorteia, de tempos em tempos, um glitch curto num dos alvos. */
export class GlitchClock {
  private next = 2500;
  constructor(private targets: () => (() => void)[]) {}
  tick(now: number) {
    if (!prefs.glitch || now < this.next) return;
    this.next = now + 3800 + Math.random() * 5200;
    const list = this.targets();
    list[Math.floor(Math.random() * list.length)]?.();
  }
}
