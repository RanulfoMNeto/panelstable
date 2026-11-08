import { defineConfig } from 'vite';

// `base: './'` gera caminhos relativos: o mesmo build funciona em
// usuario.github.io/qualquer-repositorio/ sem configurar o nome do repositório.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    cssMinify: true,
    assetsInlineLimit: 0,
  },
  worker: { format: 'es' },
});
