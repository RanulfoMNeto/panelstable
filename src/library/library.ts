import { db } from '../core/db';
import { $, esc } from '../core/dom';
import { pad2 } from '../core/math';
import type { Book, Progress } from '../core/types';

export interface LibraryActions { open(id: string): void; add(): void }

/** Estante: livros salvos neste navegador, do mais recente ao mais antigo, com progresso e marcadores. */
export class Library {
  private root = $('#lib');
  private shelf = $('#shelf');
  private covers: string[] = [];

  constructor(private act: LibraryActions) {
    $('#libAdd').onclick = () => act.add();
    $('#libDrop').onclick = () => act.add();
    this.shelf.addEventListener('click', (e) => this.onClick(e));
  }

  show(on: boolean) { this.root.hidden = !on; if (on) void this.render(); }

  async render() {
    const books = (await db.listBooks()).sort((a, b) => (b.opened || b.added) - (a.opened || a.added));
    const progress = await Promise.all(books.map((b) => db.getProgress(b.id)));
    this.covers.forEach((u) => URL.revokeObjectURL(u));
    this.covers = books.map((b) => (b.cover ? URL.createObjectURL(b.cover) : ''));
    this.root.classList.toggle('empty', !books.length);
    $('#libDrop').hidden = books.length > 0;
    this.shelf.innerHTML = books.map((b, i) => card(b, progress[i], this.covers[i], i)).join('');
  }

  private async onClick(e: Event) {
    const t = e.target as Element, del = t.closest<HTMLButtonElement>('.del'), open = t.closest<HTMLElement>('.book-open');
    if (del) {
      // primeiro toque arma, o segundo apaga (sem diálogo do navegador)
      if (!del.classList.contains('armed')) { del.classList.add('armed'); del.textContent = 'Remover?'; setTimeout(() => { del.classList.remove('armed'); del.textContent = '×'; }, 2600); return; }
      await db.remove(del.dataset.id!);
      return this.render();
    }
    if (open) this.act.open(open.dataset.id!);
  }
}

function card(b: Book, p: Progress, cover: string, i: number) {
  const total = b.pages.length, read = new Set(p.read).size, frac = total ? read / total : 0;
  const status = !p.at ? 'novo' : frac >= 0.999 ? 'lido' : `P.${pad2(p.page + 1)}/${pad2(total)}`;
  const marks = p.marks.length ? ` · 栞 ${p.marks.length}` : '';
  const when = p.at ? ` · ${ago(p.at)}` : '';
  const feat = i === 0 && p.at > 0 && frac < 0.999;
  return `<li class="book${feat ? ' feat' : ''}" style="--i:${i}">
    <button type="button" class="book-open" data-id="${esc(b.id)}" aria-label="Abrir ${esc(b.series)}">
      <span class="cover">${cover ? `<img src="${cover}" alt="" loading="lazy" decoding="async">` : ''}${feat ? '<span class="tag">続き · continuar</span>' : ''}</span>
      <span class="b-name">${esc(b.series || b.name)}</span>
      ${b.chapter ? `<span class="b-sub">${esc(b.chapter)}</span>` : ''}
      <span class="b-prog"><span style="--p:${frac.toFixed(3)}"></span></span>
      <span class="b-stat">${status}${marks}${when}</span>
    </button>
    <button type="button" class="del" data-id="${esc(b.id)}" aria-label="Remover da biblioteca">×</button>
  </li>`;
}

/** "há 5 min", "há 2 h", "há 3 d" */
function ago(t: number) {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'agora';
  if (m < 60) return `há ${m} min`;
  const h = Math.round(m / 60);
  return h < 24 ? `há ${h} h` : `há ${Math.round(h / 24)} d`;
}
