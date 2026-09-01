/**
 * Scarica i modelli MediaPipe in public/mediapipe/.
 * I .task non sono versionati (vedi .gitignore): vanno scaricati in fase di
 * build o di setup, cosi' l'app li serve dalla propria origine senza
 * dipendere da una CDN esterna a runtime.
 */
import { createWriteStream } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
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

console.log('Modelli pronti in public/mediapipe/');
