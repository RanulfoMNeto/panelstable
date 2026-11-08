/** Quadrilátero em % da página: [x0,y0, x1,y1, x2,y2, x3,y3] (sup. esq., sup. dir., inf. dir., inf. esq.). */
export type Quad = number[];
export type Dir = 'rtl' | 'ltr';
/** story = lida quadro a quadro; full = página inteira (capa, créditos); spread = página dupla; skip = fora da leitura. */
export type PageType = 'story' | 'full' | 'spread' | 'skip';

export interface PageInfo {
  name: string;
  w: number;
  h: number;
  color: boolean;
  type: PageType;
  scene: string | null;
  panels: Quad[];
  ctype: string;
}

export interface Book {
  id: string;
  name: string;
  size: number;
  added: number;
  opened: number;
  series: string;
  chapter: string;
  credits: string;
  vol: string;
  num: string;
  dir: Dir;
  pages: PageInfo[];
  cover?: Blob;
}

/** Um marcador aponta para um quadro de uma página. */
export interface Mark {
  page: number;
  panel: number;
  at: number;
}

/** Histórico de leitura de um livro. */
export interface Progress {
  page: number;
  panel: number;
  read: number[];
  marks: Mark[];
  at: number;
}
