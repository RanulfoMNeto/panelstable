# Mesa de Quadros

Leitor de mangá e quadrinhos em **CBZ**, quadro a quadro, com estética de zine cyberpunk japonês.
Roda inteiro no navegador: não tem servidor, login nem conta. A biblioteca, a posição de leitura e os
marcadores ficam salvos só no navegador de quem lê.

## O que faz

- **Biblioteca:** importa um ou vários `.cbz` (botão, arrastar e soltar). Cada livro mostra capa, progresso,
  marcadores e quando foi lido.
- **Histórico automático:** guarda a página e o quadro a cada passo. Ao abrir o site de novo, ele volta para o
  mesmo livro e o mesmo quadro. As páginas já lidas aparecem no progresso e no índice de cenas.
- **Marcadores manuais:** o botão 栞 marca o quadro atual. A lista fica no menu e cada item leva direto ao quadro.
- **Palco:** o quadro atual em destaque. Os já lidos **da mesma página** ficam numa faixa: ao lado onde a
  leitura começa em telas largas, em cima em telas altas. Ao virar a página, o palco recomeça.
- **Página:** a página no layout original, com os quadros acendendo um a um sobre o preto. Em telas largas
  aparece como livro aberto. O zoom no quadro é configurável: Auto, Sem, Suave ou Total.
- **Sentido de leitura:** lido do `ComicInfo.xml` (`Manga = YesAndRightToLeft` = mangá) e trocável no menu.
- **Navegação:**
  - tocar ou clicar na metade para onde a leitura vai avança, e na outra metade volta (no mangá: esquerda avança);
  - setas do teclado, roda do mouse e arrastar seguem o mesmo sentido.
- **Ajustes** (salvos): velocidade das transições, quantos quadros já lidos ficam no palco, alto contraste,
  negativo, prévia da página e cada efeito separado (glitch, textura, katakana, movimento, linhas de
  velocidade, nome da cena). Quem usa "reduzir movimento" no sistema começa com os efeitos desligados.

## Rodar

```bash
npm install
npm run dev       # desenvolvimento em http://localhost:5173
npm run build     # checa os tipos e gera dist/
npm run preview   # serve o dist/ para conferir
```

Requer Node 20.19+ ou 22.12+.

## Publicar no GitHub Pages

1. Suba o repositório para o GitHub (branch `main`).
2. Em **Settings → Pages → Build and deployment**, escolha **Source: GitHub Actions**.
3. A cada push na `main`, o workflow `.github/workflows/deploy.yml` gera o build e publica.

O build usa caminhos relativos (`base: './'`), então funciona em `usuario.github.io/qualquer-nome/`
sem configurar nada.

## Tecnologia

- [Vite 8](https://vite.dev) + TypeScript, sem framework de interface.
- [fflate](https://github.com/101arrowz/fflate) para abrir o ZIP do CBZ.
- [idb-keyval](https://github.com/jakearchibald/idb-keyval) para o IndexedDB.
- A análise das páginas (achar os quadros, ver se a página é colorida) roda em **Web Workers** com
  `OffscreenCanvas`, só uma vez por livro, e o resultado fica salvo. Se o navegador não tiver workers,
  ela roda na página mesmo.
- Tudo que se move é animado por `transform`/`opacity` num único laço de `requestAnimationFrame`. As
  transições usam tempo real, então ficam iguais em 30 ou 120 fps.

## Estrutura

```
src/
  main.ts              telas (biblioteca ⇄ leitor), importação, arrastar e soltar, retomar leitura
  core/
    types.ts           tipos: Book, PageInfo, Progress, Mark
    cbz.ts             abre o CBZ e lê o ComicInfo.xml
    book.ts            importa um livro: metadados, análise das páginas, cenas, capa
    detect.ts          acha os quadros (inclusive inclinados) e a ordem de leitura
    scan.worker.ts     roda a análise fora da linha principal
    db.ts              IndexedDB: livros, arquivos e histórico
    prefs.ts           ajustes do leitor
    dom.ts, math.ts    utilitários
  reader/
    reader.ts          conduz a leitura, salva o histórico e os marcadores
    model.ts           livro → cenas e passos (um por quadro)
    driver.ts          "rolagem" virtual com mola
    layout.ts          regras de composição do palco (sem cortar quadro)
    palco.ts           modo Palco
    pagina.ts          modo Página (livro aberto, zoom)
    hud.ts             lombada, índice, HUD do celular, prévia
    menu.ts            menu de ajustes
    input.ts           toque, clique, teclado, roda
    fx.ts              textura, katakana, linhas de velocidade, glitch
  library/library.ts   estante
  styles/              base.css, library.css, reader.css
```

## Onde fica cada dado

| O quê | Onde |
| --- | --- |
| Arquivo CBZ | IndexedDB `mesa-quadros-files` |
| Livro (metadados, quadros detectados, capa) | IndexedDB `mesa-quadros-books` |
| Página/quadro atual, páginas lidas, marcadores | IndexedDB `mesa-quadros-progress` |
| Ajustes e último livro aberto | `localStorage` |

Limpar os dados do site no navegador apaga a biblioteca. O app pede ao navegador armazenamento persistente
para isso não acontecer sozinho quando falta espaço.

## Metadados aproveitados do `ComicInfo.xml`

- `Series`, `Title`, `Volume`, `Number` → título e capítulo (第1巻・第1話)
- `Writer`, `Penciller`, `Inker`, `Colorist`, `Letterer`, `Translator`, `Editor`, `Publisher`, `Year` → créditos
- `Manga` → sentido de leitura
- `<Pages>`:
  - `Type` (`FrontCover`, `Story`, `Advertisement`…) → página inteira, história ou fora da leitura;
  - `Bookmark` → nome da cena;
  - `DoublePage` → página dupla.

Sem `ComicInfo.xml`, a primeira página vira capa, páginas sem quadros entram inteiras e as cenas são criadas a
cada duas páginas.

## Direitos

O repositório não inclui nenhuma obra. O leitor só abre arquivos que a própria pessoa escolhe, e esses arquivos
não saem do navegador dela.
