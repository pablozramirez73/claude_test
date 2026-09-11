// Core measurement math (architecture doc §6): converts pixel distances
// between pose landmarks into real body circumferences, using the mm/pixel
// scale from measure/calibration.ts.
//
// A body cross-section is not a circle — it's closer to an ellipse, with a
// frontal semi-axis (half the width we can measure from the silhouette) and
// a depth semi-axis (half the body's front-to-back thickness). This is
// exactly why the LiDAR/depth path matters: with true depth we measure the
// thickness directly; without it we fall back to typical anthropometric
// width/depth ratios per body region (documented below), which is still far
// better than assuming a circle (that systematically underestimates
// circumference by ~10-20%).

import type { CalibrationScale } from "./calibration";

/** Typical depth/width ratio per body region, from anthropometric surveys (ANSUR II). */
const DEPTH_WIDTH_RATIO = {
  chest: 0.62,
  waist: 0.72,
  hips: 0.68,
} as const;

export type BodyRegion = keyof typeof DEPTH_WIDTH_RATIO;

/**
 * Ramanujan's second approximation for an ellipse's perimeter — accurate to
 * within a fraction of a percent for the eccentricities real bodies have.
 * a, b are semi-axes (same unit in, same unit out).
 */
export function ellipseCircumference(a: number, b: number): number {
  if (a <= 0 || b <= 0) throw new Error("i semiassi devono essere positivi");
  const h = ((a - b) ** 2) / ((a + b) ** 2);
  return Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
}

export interface CircumferenceEstimate {
  circumferenceCm: number;
  /** true when a measured depth thickness was used instead of an anthropometric ratio. */
  usedMeasuredDepth: boolean;
}

/**
 * Estimates a body circumference from a silhouette width in pixels.
 *
 * @param widthPx    silhouette width at the region's landmark row, in pixels
 * @param scale      mm/pixel calibration (from credit card or depth sensor)
 * @param region     which body region this width belongs to (affects the depth ratio fallback)
 * @param depthThicknessPx optional silhouette thickness in pixels, if a true depth reading is available
 */
export function estimateCircumference(
  widthPx: number,
  scale: CalibrationScale,
  region: BodyRegion,
  depthThicknessPx?: number,
): CircumferenceEstimate {
  if (!(widthPx > 0)) throw new Error("larghezza in pixel non valida");

  const widthMm = widthPx * scale.mmPerPixel;
  const usedMeasuredDepth = depthThicknessPx !== undefined && depthThicknessPx > 0;
  const depthMm = usedMeasuredDepth
    ? (depthThicknessPx as number) * scale.mmPerPixel
    : widthMm * DEPTH_WIDTH_RATIO[region];

  const circumferenceMm = ellipseCircumference(widthMm / 2, depthMm / 2);
  return {
    circumferenceCm: circumferenceMm / 10,
    usedMeasuredDepth,
  };
}

export interface Point2D {
  x: number;
  y: number;
}

/** Euclidean distance between two normalized [0,1] landmark points, scaled to pixels by the frame size. */
export function landmarkDistancePx(a: Point2D, b: Point2D, frameWidth: number, frameHeight: number): number {
  const dx = (a.x - b.x) * frameWidth;
  const dy = (a.y - b.y) * frameHeight;
  return Math.sqrt(dx * dx + dy * dy);
}
