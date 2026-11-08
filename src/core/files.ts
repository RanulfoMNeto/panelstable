/** Arquivos escolhidos ou soltos: separa CBZ/ZIP de pastas de imagens e agrupa as imagens por pasta. */

const IMAGE = /\.(jpe?g|png|webp|gif|avif)$/i;
export const isArchive = (f: File) => /\.(cbz|zip)$/i.test(f.name);
export const isPicture = (f: File) => IMAGE.test(f.name) || /^image\//.test(f.type);
export const isComicInfo = (f: File) => /^comicinfo\.xml$/i.test(f.name);

/** Caminho relativo de cada arquivo (da pasta escolhida ou da pasta solta). */
const paths = new WeakMap<File, string>();
export const pathOf = (f: File) => paths.get(f) || f.webkitRelativePath || f.name;

/** Lê o que foi solto, entrando em pastas (e subpastas). */
export async function filesFromDrop(dt: DataTransfer): Promise<File[]> {
  const entries = [...dt.items].map((i) => i.webkitGetAsEntry?.()).filter((e): e is FileSystemEntry => !!e);
  if (!entries.length) return [...dt.files];
  const out: File[] = [];
  const walk = async (e: FileSystemEntry, dir: string): Promise<void> => {
    if (e.isFile) {
      const f = await new Promise<File>((ok, fail) => (e as FileSystemFileEntry).file(ok, fail));
      paths.set(f, dir + f.name); out.push(f);
    } else if (e.isDirectory) {
      const reader = (e as FileSystemDirectoryEntry).createReader();
      for (let batch: FileSystemEntry[]; (batch = await new Promise((ok, fail) => reader.readEntries(ok, fail))).length;) {
        for (const child of batch) await walk(child, `${dir}${e.name}/`);
      }
    }
  };
  for (const e of entries) await walk(e, '');
  return out;
}

/** Uma pasta = um livro. Imagens soltas (sem pasta) viram um livro só. */
export function groupPictures(files: File[]): { name: string; files: File[] }[] {
  const groups = new Map<string, File[]>();
  for (const f of files) {
    if (!isPicture(f) && !isComicInfo(f)) continue;
    const dir = pathOf(f).split('/').slice(0, -1).join('/');
    groups.set(dir, [...(groups.get(dir) ?? []), f]);
  }
  return [...groups].filter(([, fs]) => fs.some(isPicture)).map(([dir, fs]) => ({ name: dir.split('/').pop() || commonName(fs.filter(isPicture)), files: fs }));
}

/** Nome para imagens soltas: o começo comum dos nomes (ex.: "Akira_cap1_" → "Akira cap1"). */
function commonName(fs: File[]) {
  const names = fs.map((f) => f.name.replace(/\.[^.]+$/, ''));
  let p = names[0] ?? '';
  for (const n of names) while (!n.startsWith(p)) p = p.slice(0, -1);
  return p.replace(/[\s_\-.\d]+$/, '').replace(/[_]+/g, ' ').trim() || 'Imagens';
}
