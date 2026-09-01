import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Telegram Mini Apps must be served over HTTPS in production (Vercel does
// this for us). Locally, `npm run dev` is fine over HTTP for testing the
// vision pipeline in a normal browser tab.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
  },
});
