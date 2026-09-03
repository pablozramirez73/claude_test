import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Backend di sviluppo: daphne/uvicorn in ascolto sulla 7000.
const BACKEND = process.env.VITE_DEV_BACKEND ?? 'http://127.0.0.1:7000';

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
      // `credentialless` e non `require-corp`, che bloccherebbe
      // telegram-web-app.js (non manda l'header CORP).
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
    // Stesso instradamento che in produzione fa nginx davanti al backend:
    // in sviluppo l'app gira così sulla stessa origine dell'API, senza la
    // divergenza (e i bug di CORS) fra i due ambienti.
    // La barra finale non e' facoltativa: il match e' per prefisso, e senza
    // di essa '/media' catturerebbe anche '/mediapipe/...', dirottando i
    // modelli al backend.
    proxy: {
      '/api/': { target: BACKEND, changeOrigin: true },
      '/healthz/': { target: BACKEND, changeOrigin: true },
      '/admin/': { target: BACKEND, changeOrigin: true },
      '/static/': { target: BACKEND, changeOrigin: true },
      '/media/': { target: BACKEND, changeOrigin: true },
      '/ws/': { target: BACKEND, ws: true },
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
