import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Built into ../public/admin and served by the Chalkpis server at /admin (same origin: the strict admin CSP allows
// only 'self' scripts, styles, fonts and API calls). In development the API calls go to the local server.
export default defineConfig({
  base: '/admin/',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  build: {
    outDir: '../public/admin',
    emptyOutDir: true,
    assetsDir: 'assets',
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
  },
  server: {
    port: 5174,
    proxy: {
      '/admin/api': 'http://127.0.0.1:8787',
      '/admin/auth': 'http://127.0.0.1:8787',
      '/admin-logo': 'http://127.0.0.1:8787',
      '/admin-fonts': 'http://127.0.0.1:8787',
    },
  },
});
