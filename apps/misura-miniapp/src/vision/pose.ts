// Wraps @mediapipe/tasks-vision's PoseLandmarker (the "lite" model, per the
// architecture doc §5/§6) to extract the body keypoints MISURA needs:
// shoulders, hips, knees. Runs fully on-device via WASM.

import { FilesetResolver, PoseLandmarker, type PoseLandmarkerResult } from "@mediapipe/tasks-vision";

const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

let landmarkerPromise: Promise<PoseLandmarker> | null = null;

function getLandmarker(): Promise<PoseLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
      return PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
        runningMode: "IMAGE",
        numPoses: 1,
      });
    })();
  }
  return landmarkerPromise;
}

/** 33-point BlazePose topology indices we care about. */
export const POSE_LANDMARK = {
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
} as const;

export interface BodyLandmarks {
  leftShoulder: { x: number; y: number };
  rightShoulder: { x: number; y: number };
  leftHip: { x: number; y: number };
  rightHip: { x: number; y: number };
  leftKnee: { x: number; y: number };
  rightKnee: { x: number; y: number };
  leftAnkle: { x: number; y: number };
  rightAnkle: { x: number; y: number };
}

/**
 * Runs pose detection on a single frame. Coordinates are normalized [0,1]
 * relative to the frame — callers scale to pixels using the frame size.
 */
export async function detectBodyLandmarks(image: HTMLCanvasElement | HTMLVideoElement): Promise<BodyLandmarks | null> {
  const landmarker = await getLandmarker();
  const result: PoseLandmarkerResult = landmarker.detect(image);
  const points = result.landmarks?.[0];
  if (!points || points.length === 0) return null;

  const at = (index: number) => ({ x: points[index].x, y: points[index].y });

  return {
    leftShoulder: at(POSE_LANDMARK.LEFT_SHOULDER),
    rightShoulder: at(POSE_LANDMARK.RIGHT_SHOULDER),
    leftHip: at(POSE_LANDMARK.LEFT_HIP),
    rightHip: at(POSE_LANDMARK.RIGHT_HIP),
    leftKnee: at(POSE_LANDMARK.LEFT_KNEE),
    rightKnee: at(POSE_LANDMARK.RIGHT_KNEE),
    leftAnkle: at(POSE_LANDMARK.LEFT_ANKLE),
    rightAnkle: at(POSE_LANDMARK.RIGHT_ANKLE),
  };
}
