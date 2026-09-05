/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public bot username for the t.me share deep link — not a secret. */
  readonly VITE_TELEGRAM_BOT_USERNAME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
