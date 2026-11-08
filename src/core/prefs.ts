/** Ajustes do leitor: valem para qualquer livro e ficam no localStorage. */
export type View = 'palco' | 'pagina';
export type Zoom = 'auto' | 'off' | 'soft' | 'full';
export type Pace = 'slow' | 'normal' | 'fast';

export interface Prefs {
  view: View;
  /** quantos quadros já lidos da página ficam no palco (99 = todos) */
  ctx: number;
  zoom: Zoom;
  pace: Pace;
  contrast: boolean;
  negative: boolean;
  preview: boolean;
  ghost: boolean;
  glitch: boolean;
  texture: boolean;
  rain: boolean;
  motion: boolean;
  speedLines: boolean;
}

const KEY = 'mesa-quadros:prefs';
const calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export const DEFAULTS: Readonly<Prefs> = {
  view: 'palco', ctx: 99, zoom: 'auto', pace: 'normal', contrast: true, negative: false, preview: true, ghost: true,
  glitch: !calm, texture: true, rain: !calm, motion: !calm, speedLines: !calm,
};
export const EFFECTS = ['ghost', 'glitch', 'texture', 'rain', 'motion', 'speedLines'] as const;

function load(): Prefs {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEFAULTS }; }
}

export const prefs: Prefs = load();
const listeners = new Set<() => void>();

export const setPref = <K extends keyof Prefs>(key: K, value: Prefs[K]) => setPrefs({ [key]: value } as Partial<Prefs>);
export function setPrefs(patch: Partial<Prefs>) {
  Object.assign(prefs, patch);
  persist(); listeners.forEach((fn) => fn());
}
export const resetPrefs = () => setPrefs({ ...DEFAULTS });
export const onPrefs = (fn: () => void) => listeners.add(fn);

function persist() { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* sem armazenamento: segue só nesta sessão */ } }

/** Velocidade das transições (constante da mola exponencial). */
export const paceRate = () => ({ slow: 2.4, normal: 4, fast: 7 })[prefs.pace];
/** Filtro de imagem para páginas em preto e branco (coloridas ficam como estão). */
export const imageFilter = (color: boolean) => (color ? '' : [prefs.contrast && 'grayscale(1) contrast(1.2)', prefs.negative && 'invert(1)'].filter(Boolean).join(' '));
