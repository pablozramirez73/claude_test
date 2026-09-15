/**
 * Prepara gli asset MediaPipe in public/mediapipe/.
 *
 * Scarica i modelli .task e copia il runtime WASM da node_modules. Nessuno
 * dei due e' versionato (vedi .gitignore): l'app li serve dalla propria
 * origine, cosi' a runtime non dipende da una CDN esterna - che sarebbe un
 * punto di rottura in cantiere e un problema con gli header di isolamento
 * cross-origin richiesti dai thread WASM.
 */
import { createWriteStream } from 'node:fs';
import { cp, mkdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'public', 'mediapipe');

const MODELS = [
  {
    name: 'pose_landmarker_lite.task',
    url: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
  },
  {
    name: 'face_landmarker.task',
    url: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
  },
  {
    name: 'hand_landmarker.task',
    url: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
  },
];

await mkdir(OUT_DIR, { recursive: true });

for (const model of MODELS) {
  const target = join(OUT_DIR, model.name);
  try {
    await stat(target);
    console.log(`= ${model.name} gia' presente`);
    continue;
  } catch {
    /* il file non c'e': si scarica */
  }

  console.log(`> ${model.name}`);
  const response = await fetch(model.url);
  if (!response.ok || !response.body) {
    throw new Error(`Download fallito per ${model.name}: HTTP ${response.status}`);
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(target));
}

// Il runtime WASM viaggia dentro il pacchetto npm: si copia, non si scarica.
const WASM_SRC = join(ROOT, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const WASM_OUT = join(OUT_DIR, 'wasm');
try {
  await stat(WASM_SRC);
  await cp(WASM_SRC, WASM_OUT, { recursive: true });
  console.log('> runtime wasm copiato da node_modules');
} catch {
  console.warn(
    'ATTENZIONE: runtime wasm non trovato in node_modules. Esegui prima `npm install`.',
  );
}

console.log('Asset pronti in public/mediapipe/');
