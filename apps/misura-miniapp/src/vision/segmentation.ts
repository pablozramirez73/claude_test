// Wraps @mediapipe/tasks-vision's ImageSegmenter (selfie segmentation model,
// architecture doc §6) to produce a person/background mask. MISURA uses this
// to isolate the silhouette before measuring pixel widths, so background
// clutter never leaks into a measurement.

import { FilesetResolver, ImageSegmenter } from "@mediapipe/tasks-vision";

const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite";

let segmenterPromise: Promise<ImageSegmenter> | null = null;

function getSegmenter(): Promise<ImageSegmenter> {
  if (!segmenterPromise) {
    segmenterPromise = (async () => {
      const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
      return ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
        runningMode: "IMAGE",
        outputCategoryMask: true,
        outputConfidenceMasks: false,
      });
    })();
  }
  return segmenterPromise;
}

export interface SilhouetteMask {
  width: number;
  height: number;
  /** 1 = person, 0 = background, indexed [y * width + x]. */
  data: Uint8Array;
}

const PERSON_CONFIDENCE_THRESHOLD = 0.5;

export async function segmentSilhouette(image: HTMLCanvasElement | HTMLVideoElement): Promise<SilhouetteMask | null> {
  const segmenter = await getSegmenter();
  const result = segmenter.segment(image);
  const categoryMask = result.categoryMask;
  if (!categoryMask) return null;

  const width = categoryMask.width;
  const height = categoryMask.height;
  const raw = categoryMask.getAsUint8Array();
  const data = new Uint8Array(width * height);
  for (let i = 0; i < raw.length; i++) {
    // The selfie segmenter's category 0 is "person" with confidence encoded
    // in the same byte for this model variant; treat any non-zero-ish value
    // above threshold as foreground.
    data[i] = raw[i] > PERSON_CONFIDENCE_THRESHOLD * 255 ? 1 : 0;
  }

  categoryMask.close();
  return { width, height, data };
}

/** Finds the leftmost/rightmost foreground pixel in a given row — used to measure body width at a landmark's y-coordinate. */
export function silhouetteWidthAtRow(mask: SilhouetteMask, rowY: number): number | null {
  const y = Math.round(rowY * mask.height);
  if (y < 0 || y >= mask.height) return null;

  let left = -1;
  let right = -1;
  const rowStart = y * mask.width;
  for (let x = 0; x < mask.width; x++) {
    if (mask.data[rowStart + x] === 1) {
      if (left === -1) left = x;
      right = x;
    }
  }
  if (left === -1) return null;
  return right - left;
}
