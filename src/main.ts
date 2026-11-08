import './styles/base.css';
import './styles/library.css';
import './styles/reader.css';
import { importCbz, importPictures, SCAN_VERSION } from './core/book';
import { db, lastOpened, persistStorage } from './core/db';
import { $, busy, toast } from './core/dom';
import { filesFromDrop, groupPictures, isArchive } from './core/files';
import type { Book } from './core/types';
import { Library } from './library/library';
import { mountTexture } from './reader/fx';
import { Reader } from './reader/reader';

/**
 * Duas telas: a biblioteca (#/) e o leitor (#/ler/<id>). O botão voltar do navegador funciona entre elas.
 * Ao abrir o site de novo, ele volta para o livro e o quadro onde você parou.
 */
const library = new Library({ open: (id) => go(id) });
const reader = new Reader(() => go(null));

// botões [data-pick]: "cbz" abre o seletor de CBZ/ZIP; "dir" o de pasta (onde o navegador não escolhe pasta, vira seletor de vários arquivos)
const pickers = { cbz: $<HTMLInputElement>('#file'), dir: $<HTMLInputElement>('#folder') };
document.addEventListener('click', (e) => {
  const b = (e.target as Element).closest<HTMLElement>('[data-pick]');
  if (b) pickers[b.dataset.pick as keyof typeof pickers]?.click();
});
for (const input of Object.values(pickers)) input.addEventListener('change', () => { if (input.files) void addFiles([...input.files]); input.value = ''; });

const READ = '#/ler/';
const go = (id: string | null) => { location.hash = id ? READ + encodeURIComponent(id) : '#/'; };

async function route() {
  const id = location.hash.startsWith(READ) ? decodeURIComponent(location.hash.slice(READ.length)) : null;
  if (!id) { reader.close(); library.show(true); return; }
  if (reader.bookId === id) return;
  let book = await db.getBook(id);
  if (!book) { toast('Esse livro não está na biblioteca deste navegador.'); go(null); return; }
  try {
    library.show(false);
    if (book.scan !== SCAN_VERSION) book = await reanalyze(book);
    await reader.open(book);
  } catch (err) {
    toast(err instanceof Error ? err.message : 'Não foi possível abrir esse livro.');
    go(null);
  }
}

/** Livro salvo com uma análise antiga: refaz os quadros a partir do arquivo guardado (marcadores e posição ficam). */
async function reanalyze(book: Book): Promise<Book> {
  const file = await db.getFile(book.id);
  if (!file) return book;
  const f = file instanceof File ? file : new File([file], book.name);
  try { return await importCbz(f, (d, t) => busy(`Atualizando os quadros · ${d}/${t}`, d / t)); } finally { busy(null); }
}

/**
 * Importa o que foi escolhido ou solto e abre o primeiro livro: cada CBZ/ZIP é um livro, e cada pasta de imagens
 * também (no celular, um CBZ baixado às vezes chega já descompactado numa pasta).
 */
async function addFiles(files: File[]) {
  const jobs = [
    ...files.filter(isArchive).map((f) => ({ name: f.name, run: (p: Progress) => importCbz(f, p) })),
    ...groupPictures(files.filter((f) => !isArchive(f))).map((g) => ({ name: g.name, run: (p: Progress) => importPictures(g.files, g.name, p) })),
  ];
  if (!jobs.length) { toast('Escolha um .cbz ou a pasta com as imagens do capítulo.'); return; }
  let first: string | null = null;
  for (const [n, job] of jobs.entries()) {
    try {
      const label = jobs.length > 1 ? `${n + 1}/${jobs.length} · ` : '';
      busy(`${label}Lendo ${job.name}…`, 0);
      const book = await job.run((d, t) => busy(`${label}Encontrando os quadros · ${d}/${t}`, d / t));
      first ??= book.id;
    } catch (err) {
      toast(`${job.name}: ${err instanceof Error ? err.message : 'não foi possível abrir.'}`);
    }
  }
  busy(null);
  void persistStorage();
  if (first) { if (reader.bookId === first) return; go(first); } else void library.render();
}
type Progress = (done: number, total: number) => void;

// arrastar e soltar em qualquer lugar
const drop = $('#drop');
let depth = 0;
window.addEventListener('dragenter', (e) => { if (e.dataTransfer?.types.includes('Files')) { depth++; drop.hidden = false; } });
window.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) drop.hidden = true; });
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault(); depth = 0; drop.hidden = true;
  if (e.dataTransfer?.items.length) void filesFromDrop(e.dataTransfer).then(addFiles); // entra nas pastas soltas
});

window.addEventListener('hashchange', () => void route());
mountTexture();

// reabre onde parou
const last = lastOpened.get();
if (!location.hash.startsWith(READ) && last) history.replaceState(null, '', READ + encodeURIComponent(last));
void route();

