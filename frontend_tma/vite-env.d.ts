/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_WS_URL?: string;
  readonly VITE_POSE_MODEL_URL?: string;
  readonly VITE_FACE_MODEL_URL?: string;
  readonly VITE_HAND_MODEL_URL?: string;
  readonly VITE_WASM_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
