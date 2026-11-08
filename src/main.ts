import './styles/base.css';
import './styles/library.css';
import './styles/reader.css';
import { importCbz } from './core/book';
import { db, lastOpened, persistStorage } from './core/db';
import { $, busy, toast } from './core/dom';
import { Library } from './library/library';
import { mountTexture } from './reader/fx';
import { Reader } from './reader/reader';

/**
 * Duas telas: a biblioteca (#/) e o leitor (#/ler/<id>). O botão voltar do navegador funciona entre elas.
 * Ao abrir o site de novo, ele volta para o livro e o quadro onde você parou.
 */
const fileInput = $<HTMLInputElement>('#file');
const library = new Library({ open: (id) => go(id), add: () => fileInput.click() });
const reader = new Reader(() => go(null), () => fileInput.click());

const READ = '#/ler/';
const go = (id: string | null) => { location.hash = id ? READ + encodeURIComponent(id) : '#/'; };

async function route() {
  const id = location.hash.startsWith(READ) ? decodeURIComponent(location.hash.slice(READ.length)) : null;
  if (!id) { reader.close(); library.show(true); return; }
  if (reader.bookId === id) return;
  const book = await db.getBook(id);
  if (!book) { toast('Esse livro não está na biblioteca deste navegador.'); go(null); return; }
  try {
    library.show(false);
    await reader.open(book);
  } catch (err) {
    toast(err instanceof Error ? err.message : 'Não foi possível abrir esse livro.');
    go(null);
  }
}

/** Importa um ou mais CBZ e abre o primeiro. */
async function addFiles(files: FileList | File[]) {
  const list = [...files].filter((f) => /\.(cbz|zip)$/i.test(f.name));
  if (!list.length) { toast('Escolha um arquivo .cbz (ou .zip de imagens).'); return; }
  let first: string | null = null;
  for (const [n, f] of list.entries()) {
    try {
      const label = list.length > 1 ? `${n + 1}/${list.length} · ` : '';
      busy(`${label}Lendo ${f.name}…`, 0);
      const book = await importCbz(f, (d, t) => busy(`${label}Encontrando os quadros · ${d}/${t}`, d / t));
      first ??= book.id;
    } catch (err) {
      toast(`${f.name}: ${err instanceof Error ? err.message : 'não foi possível abrir.'}`);
    }
  }
  busy(null);
  void persistStorage();
  if (first) { if (reader.bookId === first) return; go(first); } else void library.render();
}

fileInput.addEventListener('change', () => { if (fileInput.files) void addFiles(fileInput.files); fileInput.value = ''; });

// arrastar e soltar em qualquer lugar
const drop = $('#drop');
let depth = 0;
window.addEventListener('dragenter', (e) => { if (e.dataTransfer?.types.includes('Files')) { depth++; drop.hidden = false; } });
window.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) drop.hidden = true; });
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => { e.preventDefault(); depth = 0; drop.hidden = true; if (e.dataTransfer?.files.length) void addFiles(e.dataTransfer.files); });

window.addEventListener('hashchange', () => void route());
mountTexture();

// reabre onde parou
const last = lastOpened.get();
if (!location.hash.startsWith(READ) && last) history.replaceState(null, '', READ + encodeURIComponent(last));
void route();

