import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 9000, sourcemap: false, assetsInlineLimit: 2048 },
  server: { port: 5173, strictPort: true }, preview: { port: 4173, strictPort: true },
});
