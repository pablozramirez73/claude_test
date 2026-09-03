import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: {
    port: 5190,
    // Telegram carica la Mini App solo via https: in sviluppo si usa un
    // tunnel (ngrok/cloudflared) che punta a questa porta.
    host: true,
    headers: {
      // MediaPipe usa SIMD e thread WASM: servono gli header di isolamento.
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  build: {
    target: 'es2020',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          // Il bundle di MediaPipe è pesante: resta in un chunk a parte,
          // caricato solo quando si apre la pagina di analisi.
          mediapipe: ['@mediapipe/tasks-vision'],
          react: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
});
