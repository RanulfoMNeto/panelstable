import type { Book } from '../core/types';
import type { Frame } from './layout';
import type { Model } from './model';

/** O livro aberto: dados, passos de leitura e as URLs das imagens das páginas. */
export interface Doc { book: Book; model: Model; urls: string[] }

/** Uma forma de ler (Palco ou Página). O leitor só conversa com elas por esta interface. */
export interface ReaderView {
  show(on: boolean): void;
  layout(f: Frame): void;
  render(t: number): void;
  /** Reaplica filtros de imagem e recalcula tudo. */
  refresh(): void;
  clear(): void;
}
