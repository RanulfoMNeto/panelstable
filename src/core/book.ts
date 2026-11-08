import { zipSync } from 'fflate';
import ScanWorker from './scan.worker?worker&inline';
import { parseComicInfo, readCbz, type ComicInfo } from './cbz';
import { isComicInfo, pathOf } from './files';
import { db } from './db';
import { scanImage, type PageScan } from './detect';
import type { Book, Dir, PageInfo } from './types';

/** Sobe quando a detecção de quadros muda: livros já salvos são reanalisados na próxima vez que abrirem. */
export const SCAN_VERSION = 2;

/** Identidade estável de um arquivo: nome + tamanho. */
export const bookId = (f: File) => `${f.name}:${f.size}`;

/**
 * Importa um CBZ para a biblioteca: lê, analisa as páginas uma vez e guarda tudo no navegador.
 * Se o livro já existe mas foi analisado por uma versão antiga, só refaz a análise (datas e progresso ficam).
 */
export async function importCbz(file: File, onProgress: (done: number, total: number) => void): Promise<Book> {
  const id = bookId(file);
  const known = await db.getBook(id);
  if (known?.scan === SCAN_VERSION) return known;

  const { images, comicInfo } = await readCbz(file);
  if (!images.length) throw new Error('Nenhuma imagem encontrada nesse arquivo.');
  const info = parseComicInfo(comicInfo);
  const meta = describe(info, file.name);
  const scans = await scanAll(images.map((i) => i.blob), meta.dir === 'rtl', onProgress);

  const pages: PageInfo[] = images.map((img, i) => ({
    name: img.name, w: scans[i].w, h: scans[i].h, color: scans[i].color,
    type: 'story', scene: null, panels: [], ctype: '',
  }));
  const { typed, marked } = applyPageHints(pages, info);
  classify(pages, scans, typed);
  if (!marked) autoScenes(pages);

  const book: Book = {
    id, name: file.name, size: file.size, added: known?.added ?? Date.now(), opened: known?.opened ?? 0,
    ...meta, pages, cover: await makeCover(images[0].blob), scan: SCAN_VERSION,
  };
  if (!known) await db.putFile(id, file);
  await db.putBook(book);
  return book;
}

/**
 * Importa uma pasta de imagens (por exemplo, um CBZ que o celular descompactou sozinho).
 * As imagens são reempacotadas num CBZ sem compressão, e daí em diante tudo segue igual a um CBZ.
 */
export async function importPictures(files: File[], name: string, onProgress: (done: number, total: number) => void): Promise<Book> {
  const entries: Record<string, Uint8Array> = {};
  for (const f of files) entries[isComicInfo(f) ? 'ComicInfo.xml' : pathOf(f).split('/').pop()!] = new Uint8Array(await f.arrayBuffer());
  const zip = zipSync(entries, { level: 0, mtime: new Date(2000, 0, 1) }); // sem data variável: a mesma pasta vira sempre o mesmo livro
  return importCbz(new File([zip as Uint8Array<ArrayBuffer>], `${name}.cbz`, { type: 'application/vnd.comicbook+zip' }), onProgress);
}

/** Título, capítulo, créditos e sentido de leitura (do ComicInfo ou do nome do arquivo). */
function describe(info: ComicInfo | null, fileName: string) {
  const m = info?.fields ?? {};
  const base = fileName.replace(/\.[^.]+$/, '').replace(/_+/g, ' ').replace(/\s+/g, ' ').trim();
  let series = m.Series || m.Title || '', chapter = '';
  if (!series) { const parts = base.split(/\s+-\s+/); series = parts[0] || base; chapter = parts.slice(1).join(' · '); }
  const bits = [m.Volume && `Vol. ${m.Volume}`, m.Number && `Nº ${m.Number}`, m.Title && m.Title !== series && m.Title].filter(Boolean);
  if (bits.length) chapter = bits.join(' · ');
  const roles: [string, string][] = [['Writer', 'Roteiro'], ['Penciller', 'Arte'], ['Inker', 'Arte-final'], ['Colorist', 'Cores'], ['Letterer', 'Letras'], ['Translator', 'Tradução'], ['Editor', 'Edição'], ['Publisher', 'Editora'], ['Year', 'Ano']];
  const credits = roles.filter(([k]) => m[k]).map(([k, label]) => `${label}: ${m[k]}`).join('\n');
  const dir: Dir = /^no$/i.test(m.Manga || '') ? 'ltr' : 'rtl';
  return { series, chapter, credits, vol: m.Volume || '', num: m.Number || '', dir };
}

/** Tipos de página e marcas de cena vindos do ComicInfo. */
function applyPageHints(pages: PageInfo[], info: ComicInfo | null) {
  let typed = false, marked = false;
  for (const pg of info?.pages ?? []) {
    const p = pages[pg.image];
    if (!p) continue;
    p.ctype = pg.type;
    if (pg.type) typed = true;
    if (/^(FrontCover|InnerCover|BackCover)$/i.test(pg.type)) p.type = 'full';
    else if (/^(Advertisement|Editorial|Letters|Preview|Roundup|Other|Deleted)$/i.test(pg.type)) p.type = 'skip';
    else if (pg.double) p.type = 'spread';
    if (pg.bookmark) { p.scene = pg.bookmark; marked = true; }
  }
  return { typed, marked };
}

/** Sem tipos no arquivo: a 1ª página é capa; páginas onde quase nada parece quadro entram inteiras. */
function classify(pages: PageInfo[], scans: PageScan[], typed: boolean) {
  pages.forEach((p, i) => {
    if (p.type === 'skip' || p.type === 'spread') return;
    if (!typed && i === 0) { p.type = 'full'; return; }
    if (typed && p.type !== 'story') return;
    const s = scans[i];
    if (!s.found || s.cov < 0.42 || s.maxA < 0.1) { if (!typed) p.type = 'full'; return; }
    p.type = 'story'; p.panels = s.panels;
  });
}

/** Sem marcas de cena: uma cena a cada duas páginas de história. */
function autoScenes(pages: PageInfo[]) {
  let c = 0;
  for (const p of pages) if (p.type === 'story') { p.scene = c % 2 === 0 ? `Cena ${c / 2 + 1}` : null; c++; }
}

/** Analisa as páginas em paralelo (workers); se o navegador não deixar, analisa aqui mesmo. */
async function scanAll(blobs: Blob[], rtl: boolean, onProgress: (done: number, total: number) => void): Promise<PageScan[]> {
  const out: PageScan[] = new Array(blobs.length);
  let done = 0;
  const tick = () => onProgress(++done, blobs.length);
  const pool = makePool(Math.min(4, navigator.hardwareConcurrency || 2));
  let next = 0;
  const blank: PageScan = { w: 1000, h: 1400, color: false, panels: [], found: 0, cov: 0, maxA: 0 };
  const run = async (scan: (b: Blob) => Promise<PageScan>) => {
    while (next < blobs.length) {
      const i = next++;
      out[i] = await scan(blobs[i]).catch(() => scanHere(blobs[i], rtl)).catch(() => blank);
      tick();
    }
  };
  if (pool) { await Promise.all(pool.map((w) => run((b) => w(b, rtl)))); pool.terminate(); }
  else await run((b) => scanHere(b, rtl));
  return out;
}

type PoolWorker = (b: Blob, rtl: boolean) => Promise<PageScan>;
function makePool(size: number): (PoolWorker[] & { terminate(): void }) | null {
  if (typeof OffscreenCanvas === 'undefined') return null;
  try {
    const workers = Array.from({ length: size }, () => new ScanWorker());
    let seq = 0;
    const broken = new Set<Worker>();
    workers.forEach((w) => w.addEventListener('error', () => broken.add(w)));
    const fns = workers.map((w) => (blob: Blob, rtl: boolean) => new Promise<PageScan>((ok, fail) => {
      if (broken.has(w)) return fail('worker');
      const id = ++seq;
      const stop = (fn: () => void) => { clearTimeout(timer); w.removeEventListener('message', onMsg); w.removeEventListener('error', onErr); fn(); };
      const onMsg = (e: MessageEvent) => { if (e.data.id === id) stop(() => (e.data.scan ? ok(e.data.scan) : fail(e.data.error))); };
      const onErr = () => stop(() => fail('worker'));
      const timer = setTimeout(onErr, 20000);
      w.addEventListener('message', onMsg);
      w.addEventListener('error', onErr);
      w.postMessage({ id, blob, rtl });
    })) as PoolWorker[] & { terminate(): void };
    fns.terminate = () => workers.forEach((w) => w.terminate());
    return fns;
  } catch { return null; }
}

async function scanHere(blob: Blob, rtl: boolean): Promise<PageScan> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image(); img.src = url; await img.decode();
    return scanImage(Object.assign(img, { width: img.naturalWidth, height: img.naturalHeight }), rtl, (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h }));
  } finally { URL.revokeObjectURL(url); }
}

/** Capa pequena (JPEG) para a estante. */
async function makeCover(blob: Blob): Promise<Blob | undefined> {
  try {
    const bmp = await createImageBitmap(blob);
    const h = 420, w = Math.round((bmp.width / bmp.height) * h);
    const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
    c.getContext('2d')!.drawImage(bmp, 0, 0, w, h); bmp.close();
    return await new Promise<Blob | undefined>((ok) => c.toBlob((b) => ok(b ?? undefined), 'image/jpeg', 0.82));
  } catch { return undefined; }
}
