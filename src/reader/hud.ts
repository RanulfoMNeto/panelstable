import { $, $$, esc, flick, press } from '../core/dom';
import { FULL, clipPolygon, pad2, svgPoints } from '../core/math';
import { imageFilter, prefs } from '../core/prefs';
import type { Book, Mark, Progress } from '../core/types';
import { sceneLabel, type Model, type Step } from './model';
import type { Doc } from './view';

/** Tudo o que informa onde você está: lombada, coluna de índice, HUD do celular, prévia, marcadores. */
export class Hud {
  private lastPage = -1;
  private peekTimer = 0;

  /** Textos fixos do livro. */
  setBook(book: Book) {
    const title = book.series || book.name, ttl = $('#ttl');
    ttl.textContent = title; ttl.dataset.text = title;
    $('#jdir').textContent = book.dir === 'rtl' ? '右から左へ・上から下へ' : '左から右へ・上から下へ';
    const jp = [book.vol && `第${book.vol}巻`, book.num && `第${book.num}話`].filter(Boolean).join('・');
    const chap = $('#chap');
    chap.innerHTML = (jp ? `<b>${esc(jp)}</b>` : '') + (book.chapter ? `<span>${esc(book.chapter)}</span>` : '');
    chap.hidden = !jp && !book.chapter;
    $('#credits').textContent = book.credits; $('#credits').hidden = !book.credits;
    $('#barcode').innerHTML = barcode(`${title}|${book.chapter}`);
    this.lastPage = -1;
  }

  /** Lista de cenas (no índice e no menu), marcando as já lidas. */
  setScenes(model: Model, progress: Progress, book: Book) {
    const read = new Set(progress.read);
    const html = model.scenes.map((sc, i) => `<li data-s="${i}" class="${sc.pages.every((p) => read.has(p)) ? 'read' : ''}"><button type="button"><i>${pad2(i + 1)}</i><span>${esc(sceneLabel(sc))}</span></button></li>`).join('');
    $('#scenes').innerHTML = html; $('#mscenes').innerHTML = html;
    const pages = book.pages.length;
    $('#tot').textContent = `${pages} ${pages === 1 ? 'pág.' : 'págs.'} · ${model.scenes.length} ${model.scenes.length === 1 ? 'cena' : 'cenas'}`;
  }

  /** Título vertical do tamanho da lombada. */
  fitTitle() {
    const el = $('#ttl'), h = el.clientHeight;
    if (!h) return;
    el.style.fontSize = '100px';
    const len = el.scrollHeight, cap = Math.min(150, window.innerWidth * 0.085);
    el.style.fontSize = `${Math.max(16, Math.min(cap, ((100 * h) / Math.max(1, len)) * 0.98)).toFixed(1)}px`;
  }

  /** Atualiza tudo para o passo atual. */
  update(doc: Doc, k: number, compact: boolean, marked: boolean) {
    const st = doc.model.steps[k];
    if (!st) return;
    const page = doc.book.pages[st.p], panels = page.type === 'story' ? Math.max(1, page.panels.length) : 1;
    const cover = st.k === 'full' && (st.p === 0 || /frontcover/i.test(page.ctype));
    const big = cover ? 'CAPA' : page.type === 'spread' ? 'DUPLA' : pad2(st.p + 1);
    const tag = (cover ? '表紙' : `P.${pad2(st.p + 1)}`) + (st.j >= 0 && panels > 1 ? ` · ${st.j + 1}/${panels}` : '');
    const pos = $('#pos');
    pos.textContent = big; pos.dataset.text = big;
    $('#pof').textContent = `${cover ? '表紙' : 'ページ'} · ${st.p + 1} de ${doc.book.pages.length}`;
    $('#hpos').textContent = tag;
    if (st.p !== this.lastPage) { this.lastPage = st.p; if (prefs.glitch) flick(pos); }
    const th = $('#pthumb');
    drawThumb(th, doc.urls[st.p], page.color, st.j >= 0 ? page.panels[st.j] : null);
    th.classList.remove('flash'); void th.offsetWidth; th.classList.add('flash');
    if (compact && prefs.preview) this.peek(doc, st, tag);
    for (const ol of $$('#scenes, #mscenes')) {
      [...ol.children].forEach((li, i) => li.classList.toggle('now', st.k !== 'full' && i === st.s));
      const now = ol.querySelector<HTMLElement>('.now');
      if (now && ol.clientHeight) ol.scrollTop = now.offsetTop - (ol.clientHeight - now.offsetHeight) / 2;
    }
    this.setMarked(marked);
    const sc = st.s >= 0 && st.k !== 'full' ? doc.model.scenes[st.s] : null;
    $('#live').textContent = `${sc ? `Cena ${st.s + 1}, ${sceneLabel(sc)}. ` : ''}${cover ? 'Capa' : `Página ${st.p + 1}`}${st.j >= 0 ? `, quadro ${st.j + 1} de ${panels}` : ''}.`;
  }

  setMarked(on: boolean) { press($$('[data-mark]'), () => on); }

  /** Marcadores no menu. */
  setMarks(marks: Mark[], book: Book) {
    $('#marks').innerHTML = marks
      .slice().sort((a, b) => a.page - b.page || a.panel - b.panel)
      .map((m) => {
        const panels = book.pages[m.page]?.panels.length || 1;
        const when = new Date(m.at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        return `<li><button type="button" data-go="${m.page}:${m.panel}">P.${pad2(m.page + 1)}${panels > 1 ? ` · quadro ${m.panel + 1}` : ''} · ${when}</button><button type="button" class="x" data-del="${m.page}:${m.panel}" aria-label="Remover marcador">×</button></li>`;
      }).join('');
  }

  private peek(doc: Doc, st: Step, tag: string) {
    const page = doc.book.pages[st.p];
    drawThumb($('#peekThumb'), doc.urls[st.p], page.color, st.j >= 0 ? page.panels[st.j] : null);
    $('#peekTxt').textContent = tag;
    const el = $('#peek');
    el.classList.add('on');
    clearTimeout(this.peekTimer);
    this.peekTimer = window.setTimeout(() => el.classList.remove('on'), 1600);
  }
}

/** Miniatura da página com o quadro atual aceso e contornado. */
function drawThumb(el: HTMLElement, url: string, color: boolean, q: number[] | null | undefined) {
  const [i0, i1] = $$<HTMLImageElement>('img', el), po = $<SVGPolygonElement>('polygon', el), quad = q ?? FULL;
  if (i0.dataset.src !== url) {
    i0.src = i1.src = url; i0.dataset.src = url;
    i0.onload = () => (el.style.aspectRatio = String(i0.naturalWidth / i0.naturalHeight));
  }
  i0.style.filter = i1.style.filter = imageFilter(color);
  i1.style.clipPath = clipPolygon(quad);
  po.setAttribute('points', svgPoints(quad));
}

/** Código de barras decorativo, estável para o mesmo título. */
function barcode(str: string) {
  let h = 2166136261;
  for (const ch of str) { h ^= ch.codePointAt(0)!; h = Math.imul(h, 16777619); }
  const rnd = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 1000) / 1000; };
  let x = 0, out = '';
  while (x < 100) { const w = 1 + Math.floor(rnd() * 4); out += `<rect x="${x}" width="${Math.min(w, 100 - x)}" height="18"/>`; x += w + 1 + Math.floor(rnd() * 3); }
  return `<g fill="#f3f2ee">${out}</g>`;
}
