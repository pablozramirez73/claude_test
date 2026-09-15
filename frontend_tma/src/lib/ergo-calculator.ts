/**
 * Geometria ergonomica calcolata sui landmark MediaPipe.
 *
 * Gli angoli si calcolano sui *world landmarks* (coordinate metriche
 * centrate sul bacino): sono indipendenti dalla distanza della camera e
 * dall'inquadratura, a differenza dei landmark normalizzati usati solo per
 * disegnare l'overlay.
 *
 * Convenzione: y cresce verso il basso (come nell'immagine), quindi la
 * verticale "in su" e' il vettore (0, -1, 0).
 */
import type { AngleStats, Coupling } from '../types';

export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

/* ------------------------------------------------------- indici BlazePose */

export const POSE = {
  NOSE: 0,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
} as const;

/** Coppie di landmark per disegnare lo scheletro nell'overlay. */
export const POSE_CONNECTIONS: [number, number][] = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [24, 26], [26, 28],
];

/* ------------------------------------------------------------ vettori 3D */

type Vec3 = { x: number; y: number; z: number };

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const mid = (a: Vec3, b: Vec3): Vec3 => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
  z: (a.z + b.z) / 2,
});
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const norm = (a: Vec3): number => Math.sqrt(dot(a, a));

const RAD_TO_DEG = 180 / Math.PI;

/** Angolo fra due vettori, in gradi (0-180). */
export function angleBetween(a: Vec3, b: Vec3): number {
  const denominator = norm(a) * norm(b);
  if (denominator < 1e-6) return 0;
  const cosine = Math.min(1, Math.max(-1, dot(a, b) / denominator));
  return Math.acos(cosine) * RAD_TO_DEG;
}

/** Angolo nel vertice `b` del triangolo a-b-c (es. gomito, ginocchio). */
export function jointAngle(a: Vec3, b: Vec3, c: Vec3): number {
  return angleBetween(sub(a, b), sub(c, b));
}

const UP: Vec3 = { x: 0, y: -1, z: 0 };

/* --------------------------------------------------------- angoli ergonomici */

export interface PoseAngles {
  trunkFlexion: number;
  trunkTwist: number;
  neckFlexion: number;
  shoulderElevation: number;
  elbowAngle: number;
  kneeAngle: number;
  confidence: number;
}

/**
 * Estrae gli angoli di interesse da un frame.
 * Restituisce null se i landmark del tronco non sono abbastanza affidabili:
 * meglio scartare il frame che inquinare le statistiche.
 */
export function computeAngles(
  landmarks: Landmark[],
  minVisibility = 0.5,
): PoseAngles | null {
  if (!landmarks || landmarks.length < 29) return null;

  const at = (index: number) => landmarks[index];
  const core = [POSE.LEFT_SHOULDER, POSE.RIGHT_SHOULDER, POSE.LEFT_HIP, POSE.RIGHT_HIP];
  const visibilities = core.map((index) => at(index)?.visibility ?? 1);
  if (visibilities.some((v) => v < minVisibility)) return null;

  const leftShoulder = at(POSE.LEFT_SHOULDER);
  const rightShoulder = at(POSE.RIGHT_SHOULDER);
  const leftHip = at(POSE.LEFT_HIP);
  const rightHip = at(POSE.RIGHT_HIP);

  const shoulderMid = mid(leftShoulder, rightShoulder);
  const hipMid = mid(leftHip, rightHip);

  // Inclinazione del tronco rispetto alla verticale.
  const trunkVector = sub(shoulderMid, hipMid);
  const trunkFlexion = angleBetween(trunkVector, UP);

  // Torsione: angolo fra l'asse delle spalle e quello dei fianchi proiettati
  // sul piano orizzontale (x-z). Con busto e bacino allineati vale ~0.
  const shoulderAxis = sub(leftShoulder, rightShoulder);
  const hipAxis = sub(leftHip, rightHip);
  const shoulderYaw = Math.atan2(shoulderAxis.z, shoulderAxis.x);
  const hipYaw = Math.atan2(hipAxis.z, hipAxis.x);
  let twist = (shoulderYaw - hipYaw) * RAD_TO_DEG;
  twist = ((twist + 180) % 360) - 180; // riporta in [-180, 180]
  const trunkTwist = Math.abs(twist);

  // Collo: asse spalle -> orecchie rispetto all'asse del tronco.
  const earMid = mid(at(POSE.LEFT_EAR), at(POSE.RIGHT_EAR));
  const neckVector = sub(earMid, shoulderMid);
  const neckFlexion = angleBetween(neckVector, trunkVector);

  // Elevazione del braccio: si prende il lato piu' sollecitato.
  const leftArm = angleBetween(sub(at(POSE.LEFT_ELBOW), leftShoulder), sub(hipMid, shoulderMid));
  const rightArm = angleBetween(sub(at(POSE.RIGHT_ELBOW), rightShoulder), sub(hipMid, shoulderMid));
  const shoulderElevation = Math.max(leftArm, rightArm);

  const leftElbow = jointAngle(leftShoulder, at(POSE.LEFT_ELBOW), at(POSE.LEFT_WRIST));
  const rightElbow = jointAngle(rightShoulder, at(POSE.RIGHT_ELBOW), at(POSE.RIGHT_WRIST));
  const elbowAngle = Math.min(leftElbow, rightElbow);

  const leftKnee = jointAngle(leftHip, at(POSE.LEFT_KNEE), at(POSE.LEFT_ANKLE));
  const rightKnee = jointAngle(rightHip, at(POSE.RIGHT_KNEE), at(POSE.RIGHT_ANKLE));
  // Il ginocchio piu' esteso distingue lo "stoop" (schiena curva) dallo squat.
  const kneeAngle = Math.max(leftKnee, rightKnee);

  const confidence = visibilities.reduce((sum, v) => sum + v, 0) / visibilities.length;

  return {
    trunkFlexion,
    trunkTwist,
    neckFlexion,
    shoulderElevation,
    elbowAngle,
    kneeAngle,
    confidence,
  };
}

/* ------------------------------------------------------------- statistiche */

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const position = (sorted.length - 1) * p;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

/** Accumula i valori di un angolo e ne restituisce mean/p95/max/min. */
export class AngleAccumulator {
  private readonly values: number[] = [];

  push(value: number): void {
    if (Number.isFinite(value)) this.values.push(value);
  }

  get count(): number {
    return this.values.length;
  }

  get last(): number {
    return this.values[this.values.length - 1] ?? 0;
  }

  stats(): AngleStats | undefined {
    if (this.values.length === 0) return undefined;
    const sorted = [...this.values].sort((a, b) => a - b);
    const sum = this.values.reduce((acc, value) => acc + value, 0);
    return {
      mean: round(sum / this.values.length),
      p95: round(percentile(sorted, 0.95)),
      max: round(sorted[sorted.length - 1]),
      min: round(sorted[0]),
    };
  }
}

const round = (value: number): number => Math.round(value * 10) / 10;

/* ------------------------------------------------- fatica (Face Landmarker) */

// Indici dei contorni oculari nel modello a 478 punti.
const LEFT_EYE = [33, 160, 158, 133, 153, 144];
const RIGHT_EYE = [362, 385, 387, 263, 373, 380];
const MOUTH_VERTICAL = [13, 14];
const MOUTH_HORIZONTAL = [78, 308];

const distance = (a: Vec3, b: Vec3): number => norm(sub(a, b));

/**
 * Eye Aspect Ratio: rapporto fra le due distanze verticali e quella
 * orizzontale dell'occhio. Sotto ~0.21 l'occhio e' considerato chiuso.
 */
export function eyeAspectRatio(face: Landmark[], eye: number[]): number {
  const [p1, p2, p3, p4, p5, p6] = eye.map((index) => face[index]);
  if (!p1 || !p4) return 0;
  const horizontal = distance(p1, p4);
  if (horizontal < 1e-6) return 0;
  return (distance(p2, p6) + distance(p3, p5)) / (2 * horizontal);
}

export function faceEar(face: Landmark[]): number {
  if (!face || face.length < 400) return 0;
  return (eyeAspectRatio(face, LEFT_EYE) + eyeAspectRatio(face, RIGHT_EYE)) / 2;
}

/** Mouth Aspect Ratio: sopra ~0.6 la bocca e' spalancata (sbadiglio). */
export function mouthAspectRatio(face: Landmark[]): number {
  if (!face || face.length < 400) return 0;
  const horizontal = distance(face[MOUTH_HORIZONTAL[0]], face[MOUTH_HORIZONTAL[1]]);
  if (horizontal < 1e-6) return 0;
  return distance(face[MOUTH_VERTICAL[0]], face[MOUTH_VERTICAL[1]]) / horizontal;
}

export const EAR_CLOSED_THRESHOLD = 0.21;
const YAWN_THRESHOLD = 0.6;
const YAWN_MIN_FRAMES = 8; // ~0.3 s a 25 fps: filtra il parlato

/** Macchina a stati che conta ammiccamenti e sbadigli lungo l'acquisizione. */
export class FatigueTracker {
  private earSum = 0;
  private earCount = 0;
  private earMin = 1;
  private eyeClosed = false;
  private blinks = 0;
  private yawns = 0;
  private mouthOpenFrames = 0;

  push(face: Landmark[]): void {
    const ear = faceEar(face);
    if (ear <= 0) return;

    this.earSum += ear;
    this.earCount += 1;
    this.earMin = Math.min(this.earMin, ear);

    if (ear < EAR_CLOSED_THRESHOLD) {
      this.eyeClosed = true;
    } else if (this.eyeClosed) {
      this.eyeClosed = false;
      this.blinks += 1;
    }

    if (mouthAspectRatio(face) > YAWN_THRESHOLD) {
      this.mouthOpenFrames += 1;
      if (this.mouthOpenFrames === YAWN_MIN_FRAMES) this.yawns += 1;
    } else {
      this.mouthOpenFrames = 0;
    }
  }

  result(elapsedSeconds: number) {
    if (this.earCount === 0) return undefined;
    const minutes = Math.max(elapsedSeconds / 60, 1 / 60);
    return {
      mean: Math.round((this.earSum / this.earCount) * 1000) / 1000,
      min: Math.round(this.earMin * 1000) / 1000,
      blink_rate_per_min: Math.round(this.blinks / minutes),
      yawn_count: this.yawns,
    };
  }
}

/* ---------------------------------------------- presa (Hand Landmarker) */

const HAND = {
  WRIST: 0,
  THUMB_TIP: 4,
  INDEX_MCP: 5,
  INDEX_TIP: 8,
  MIDDLE_MCP: 9,
  MIDDLE_TIP: 12,
  RING_TIP: 16,
  PINKY_MCP: 17,
  PINKY_TIP: 20,
} as const;

/**
 * Distingue la presa di potenza (pollice in opposizione, dita chiuse) dalla
 * presa a uncino (dita flesse, pollice inattivo), che il moltiplicatore CM
 * di NIOSH penalizza.
 */
export function classifyGrip(hand: Landmark[]): Coupling | undefined {
  if (!hand || hand.length < 21) return undefined;

  // Scala di riferimento: ampiezza del palmo, per rendere le misure
  // indipendenti dalla distanza della mano dalla camera.
  const palm = distance(hand[HAND.INDEX_MCP], hand[HAND.PINKY_MCP]);
  if (palm < 1e-6) return undefined;

  const curl =
    [HAND.INDEX_TIP, HAND.MIDDLE_TIP, HAND.RING_TIP, HAND.PINKY_TIP]
      .map((tip) => distance(hand[tip], hand[HAND.WRIST]) / palm)
      .reduce((sum, value) => sum + value, 0) / 4;

  // Opposizione del pollice: quanto la punta si avvicina alle teste
  // metacarpali delle altre dita.
  const thumbOpposition = distance(hand[HAND.THUMB_TIP], hand[HAND.MIDDLE_MCP]) / palm;

  const fingersClosed = curl < 1.9;
  const thumbEngaged = thumbOpposition < 1.3;

  if (fingersClosed && thumbEngaged) return 'GOOD';
  if (fingersClosed && !thumbEngaged) return 'POOR'; // presa a uncino
  return 'FAIR';
}

/* ------------------------------------------------------ feedback in tempo reale */

export interface LiveWarning {
  code: string;
  label: string;
  severity: 'warn' | 'high';
}

/** Avvisi mostrati durante la scansione (e usati per l'haptic feedback). */
export function liveWarnings(
  angles: PoseAngles,
  limits: { trunkFlexion: number; trunkTwist: number; armElevation: number; neckFlexion: number },
): LiveWarning[] {
  const warnings: LiveWarning[] = [];

  if (angles.trunkFlexion > limits.trunkFlexion) {
    warnings.push({
      code: 'TRUNK',
      label: `Schiena ${Math.round(angles.trunkFlexion)}°`,
      severity: angles.trunkFlexion > 60 ? 'high' : 'warn',
    });
  }
  if (angles.trunkTwist > limits.trunkTwist) {
    warnings.push({
      code: 'TWIST',
      label: `Torsione ${Math.round(angles.trunkTwist)}°`,
      severity: angles.trunkTwist > 30 ? 'high' : 'warn',
    });
  }
  if (angles.shoulderElevation > limits.armElevation) {
    warnings.push({
      code: 'ARM',
      label: `Braccia ${Math.round(angles.shoulderElevation)}°`,
      severity: angles.shoulderElevation > 120 ? 'high' : 'warn',
    });
  }
  if (angles.neckFlexion > limits.neckFlexion) {
    warnings.push({
      code: 'NECK',
      label: `Collo ${Math.round(angles.neckFlexion)}°`,
      severity: 'warn',
    });
  }

  return warnings;
}
