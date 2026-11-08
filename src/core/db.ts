import { createStore, del, get, set, values } from 'idb-keyval';
import type { Book, Progress } from './types';

/** Três depósitos no IndexedDB: dados do livro, o arquivo CBZ e o histórico de leitura. */
const books = createStore('mesa-quadros-books', 'books');
const files = createStore('mesa-quadros-files', 'files');
const progress = createStore('mesa-quadros-progress', 'progress');

export const emptyProgress = (): Progress => ({ page: 0, panel: 0, read: [], marks: [], at: 0 });

export const db = {
  listBooks: () => values<Book>(books),
  getBook: (id: string) => get<Book>(id, books),
  putBook: (b: Book) => set(b.id, b, books),
  getFile: (id: string) => get<Blob>(id, files),
  putFile: (id: string, blob: Blob) => set(id, blob, files),
  async getProgress(id: string): Promise<Progress> { return { ...emptyProgress(), ...(await get<Progress>(id, progress)) }; },
  putProgress: (id: string, p: Progress) => set(id, p, progress),
  async remove(id: string) { await Promise.all([del(id, books), del(id, files), del(id, progress)]); },
};

/** Pede ao navegador para não apagar a biblioteca quando faltar espaço. */
export const persistStorage = () => navigator.storage?.persist?.().catch(() => false);

/** Livro aberto por último (para reabrir onde parou). */
const LAST = 'mesa-quadros:last';
export const lastOpened = {
  get: () => { try { return localStorage.getItem(LAST); } catch { return null; } },
  set: (id: string | null) => { try { id ? localStorage.setItem(LAST, id) : localStorage.removeItem(LAST); } catch { /* ignora */ } },
};
