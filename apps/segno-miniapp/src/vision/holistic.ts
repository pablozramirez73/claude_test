/**
 * Wrapper around MediaPipe Tasks Vision's HolisticLandmarker (PRD §5,
 * "Core Vision — MediaPipe Holistic è tutto").
 *
 * Loads the WASM runtime + `holistic_landmarker.task` model straight from
 * Google's CDN, so no model file needs to ship in this repo. In a later
 * phase the model can be self-hosted alongside the custom
 * `lis_classifier.tflite` (PRD §7).
 */
import {
  FilesetResolver,
  HolisticLandmarker,
  type HolisticLandmarkerResult,
} from "@mediapipe/tasks-vision";

const WASM_BASE =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/holistic_landmarker/holistic_landmarker/float16/latest/holistic_landmarker.task";

let landmarkerPromise: Promise<HolisticLandmarker> | null = null;

function getLandmarker(): Promise<HolisticLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = FilesetResolver.forVisionTasks(WASM_BASE).then(
      (fileset) =>
        HolisticLandmarker.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath: MODEL_URL,
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          // Nessun frame lascia il dispositivo (PRD §10): tutta
          // l'inferenza gira on-device, nel browser, via WASM/WebGL.
          minFaceDetectionConfidence: 0.5,
          minHandLandmarksConfidence: 0.5,
          minPoseDetectionConfidence: 0.5,
        }),
    );
  }
  return landmarkerPromise;
}

/**
 * Esegue l'inferenza Holistic su un singolo frame video.
 */
export async function detectFrame(
  video: HTMLVideoElement,
  timestampMs: number,
): Promise<HolisticLandmarkerResult> {
  const landmarker = await getLandmarker();
  return landmarker.detectForVideo(video, timestampMs);
}

export type { HolisticLandmarkerResult };
