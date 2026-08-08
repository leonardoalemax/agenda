// @ts-check
import { defineConfig } from 'astro/config';
import AstroPWA from '@vite-pwa/astro';

// ============================================================
// AJUSTE AQUI ao publicar no GitHub Pages:
//  - SITE: https://SEU_USUARIO.github.io
//  - BASE: '/NOME_DO_REPOSITORIO/'  (mantenha as barras)
// Se usar um repo chamado "SEU_USUARIO.github.io" (user page)
// ou um domínio próprio, deixe BASE como '/'.
// ============================================================
const SITE = 'https://leualemax.github.io';
const BASE = '/minha-agenda/';

export default defineConfig({
  site: SITE,
  base: BASE,
  integrations: [
    AstroPWA({
      registerType: 'autoUpdate',
      // Deixa o app instalável e disponível offline
      manifest: {
        name: 'Minha Agenda',
        short_name: 'Agenda',
        description: 'Agenda pessoal em Markdown — diários, checklists e páginas custom, offline.',
        theme_color: '#f5f5f7',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: BASE,
        scope: BASE,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // MPA: sem navigateFallback. Cada página tem HTML próprio no precache,
        // então navegação offline resolve pelo precache (senão o SW serviria
        // sempre o index para qualquer rota).
        globPatterns: ['**/*.{js,css,html,svg,png,jpg,jpeg,webp,gif,ico,txt,woff,woff2,json}'],
        // imagens de kits podem passar de 2MB no futuro
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      devOptions: {
        // Permite testar o PWA em `npm run dev`
        enabled: false,
      },
    }),
  ],
});
