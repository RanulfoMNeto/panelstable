import { unzip, unzipSync, type Unzipped } from 'fflate';

export interface ArchiveImage { name: string; blob: Blob }
export interface Archive { images: ArchiveImage[]; comicInfo: string }

const IMAGE = /\.(jpe?g|png|webp|gif|avif)$/i;
const MIME: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif' };
const wanted = (name: string) => !/(^|\/)(__MACOSX|\.)/.test(name) && (IMAGE.test(name) || /(^|\/)comicinfo\.xml$/i.test(name));

/** Abre um CBZ (ZIP de imagens). As páginas seguem a ordem natural dos nomes. */
export async function readCbz(file: Blob): Promise<Archive> {
  const data = new Uint8Array(await file.arrayBuffer());
  const files = await new Promise<Unzipped>((ok, fail) => {
    try { unzip(data, { filter: (f) => wanted(f.name) }, (err, out) => (err ? fail(err) : ok(out))); }
    catch { ok(unzipSync(data, { filter: (f) => wanted(f.name) })); } // sem workers disponíveis
  }).catch(() => unzipSync(data, { filter: (f) => wanted(f.name) }));

  let comicInfo = '';
  const images: (ArchiveImage & { path: string })[] = [];
  for (const [path, bytes] of Object.entries(files)) {
    if (/comicinfo\.xml$/i.test(path)) { comicInfo = new TextDecoder().decode(bytes); continue; }
    const ext = path.split('.').pop()!.toLowerCase();
    images.push({ path, name: path.split('/').pop()!, blob: new Blob([bytes as Uint8Array<ArrayBuffer>], { type: MIME[ext] }) });
  }
  images.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' }));
  return { images, comicInfo };
}

/** Campos do ComicInfo.xml que o leitor usa. */
export interface ComicInfo {
  fields: Record<string, string>;
  pages: { image: number; type: string; bookmark: string; double: boolean }[];
}

export function parseComicInfo(xml: string): ComicInfo | null {
  if (!xml) return null;
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) return null;
  const fields: Record<string, string> = {};
  const pages: ComicInfo['pages'] = [];
  for (const el of doc.documentElement.children) {
    if (el.localName.toLowerCase() === 'pages') {
      for (const p of el.children) pages.push({
        image: parseInt(p.getAttribute('Image') || '-1', 10),
        type: p.getAttribute('Type') || '',
        bookmark: (p.getAttribute('Bookmark') || '').trim(),
        double: /^true$/i.test(p.getAttribute('DoublePage') || ''),
      });
    } else if (el.textContent?.trim()) fields[el.localName] = el.textContent.trim();
  }
  return { fields, pages };
}
