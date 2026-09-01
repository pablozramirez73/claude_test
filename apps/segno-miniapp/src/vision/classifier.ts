/**
 * POC sign classifier (PRD §11, Week 1-3).
 *
 * The full pipeline described in PRD §5 is:
 *
 *   30-frame landmark sequence -> TFLite LSTM classifier -> glossa LIS -> frase
 *
 * `lis_classifier.tflite` does not exist yet (it needs the WLIS + custom
 * dataset from PRD §7 to be trained). To make the POC runnable today, this
 * module keeps the same shape — a rolling 30-frame landmark buffer feeding
 * a classifier — but the classifier itself is a simple geometric handshape
 * heuristic (finger-extension pattern on one hand) instead of a trained
 * model. Swap `classifyHeuristic()` for a real `lis_classifier.tflite`
 * inference call once it's trained, without touching the buffering/
 * debouncing logic below.
 */
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { SIGN_VOCABULARY, type SignEntry } from "./signs";

export const SEQUENCE_LENGTH = 30;

// How many of the last STABILITY_WINDOW frames must agree on the same
// gloss before we consider it "detected" — avoids flicker from single
// noisy frames.
const STABILITY_WINDOW = 15;
const STABILITY_THRESHOLD = 10;

// Minimum gap between two detections of the *same* gloss, so a held sign
// doesn't spam the transcript every frame.
const COOLDOWN_MS = 1500;

// Hand landmark indices (MediaPipe Hands topology).
const WRIST = 0;
const FINGERS: Array<{ tip: number; pip: number }> = [
  { tip: 4, pip: 2 }, // thumb (tip, mcp)
  { tip: 8, pip: 6 }, // index (tip, pip)
  { tip: 12, pip: 10 }, // middle
  { tip: 16, pip: 14 }, // ring
  { tip: 20, pip: 18 }, // pinky
];

function distance(a: NormalizedLandmark, b: NormalizedLandmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = (a.z ?? 0) - (b.z ?? 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** true if the fingertip is farther from the wrist than its middle joint. */
function isFingerExtended(
  landmarks: NormalizedLandmark[],
  tip: number,
  pip: number,
): boolean {
  return distance(landmarks[WRIST], landmarks[tip]) > distance(landmarks[WRIST], landmarks[pip]) * 1.1;
}

type FingerPattern = [boolean, boolean, boolean, boolean, boolean];

function extractFingerPattern(landmarks: NormalizedLandmark[]): FingerPattern {
  return FINGERS.map((f) => isFingerExtended(landmarks, f.tip, f.pip)) as FingerPattern;
}

/**
 * Naive handshape -> glossa mapping for the demo vocabulary
 * (`src/vision/signs.ts`). Placeholder for the trained LSTM classifier.
 */
function classifyHeuristic(pattern: FingerPattern): SignEntry | null {
  const [thumb, index, middle, ring, pinky] = pattern;
  const extendedCount = pattern.filter(Boolean).length;

  if (extendedCount === 5) return findGloss("CIAO");
  if (extendedCount === 0) return findGloss("AIUTO");
  if (thumb && !index && !middle && !ring && !pinky) return findGloss("SI");
  if (pinky && !thumb && !index && !middle && !ring) return findGloss("NO");
  if (index && !thumb && !middle && !ring && !pinky) return findGloss("IO");
  if (index && middle && !thumb && !ring && !pinky) return findGloss("OK");
  if (thumb && pinky && !index && !middle && !ring) return findGloss("GRAZIE");

  return null;
}

function findGloss(gloss: string): SignEntry {
  const entry = SIGN_VOCABULARY.find((s) => s.gloss === gloss);
  if (!entry) throw new Error(`Gloss sconosciuta: ${gloss}`);
  return entry;
}

export interface DetectionEvent {
  sign: SignEntry;
  timestampMs: number;
}

/**
 * Stateful classifier: buffers recent landmark frames, applies the
 * heuristic per-frame, and debounces the result into discrete
 * "detection" events.
 */
export class SignClassifier {
  private readonly landmarkBuffer: NormalizedLandmark[][] = [];
  private readonly recentGlosses: (string | null)[] = [];
  private lastEmitted: { gloss: string; atMs: number } | null = null;

  /**
   * Feed one frame of a single hand's 21 landmarks. Returns a
   * DetectionEvent when a new, stable sign is recognized, otherwise null.
   */
  pushFrame(
    handLandmarks: NormalizedLandmark[] | undefined,
    timestampMs: number,
  ): DetectionEvent | null {
    if (handLandmarks && handLandmarks.length === 21) {
      this.landmarkBuffer.push(handLandmarks);
      if (this.landmarkBuffer.length > SEQUENCE_LENGTH) {
        this.landmarkBuffer.shift();
      }
    }

    const guess = handLandmarks
      ? classifyHeuristic(extractFingerPattern(handLandmarks))
      : null;

    this.recentGlosses.push(guess?.gloss ?? null);
    if (this.recentGlosses.length > STABILITY_WINDOW) {
      this.recentGlosses.shift();
    }

    return this.resolveStableDetection(timestampMs);
  }

  private resolveStableDetection(timestampMs: number): DetectionEvent | null {
    const counts = new Map<string, number>();
    for (const gloss of this.recentGlosses) {
      if (!gloss) continue;
      counts.set(gloss, (counts.get(gloss) ?? 0) + 1);
    }

    let bestGloss: string | null = null;
    let bestCount = 0;
    for (const [gloss, count] of counts) {
      if (count > bestCount) {
        bestGloss = gloss;
        bestCount = count;
      }
    }

    if (!bestGloss || bestCount < STABILITY_THRESHOLD) return null;

    const onCooldown =
      this.lastEmitted?.gloss === bestGloss &&
      timestampMs - this.lastEmitted.atMs < COOLDOWN_MS;
    if (onCooldown) return null;

    this.lastEmitted = { gloss: bestGloss, atMs: timestampMs };
    return { sign: findGloss(bestGloss), timestampMs };
  }
}
