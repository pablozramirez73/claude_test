import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Telegram Mini Apps must be served over HTTPS in production (Cloudflare
// Pages / Vercel do this for us). Locally, `npm run dev` is fine over HTTP
// for testing the scan + vision pipeline in a normal browser tab.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
  },
  test: {
    // Unit tests only cover the pure measurement math (measure/*.test.ts),
    // so the default "node" environment is enough — no jsdom dependency needed.
  },
});
