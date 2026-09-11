// "Carta di Credito" fallback calibration (architecture doc §9), for devices
// without LiDAR / WebXR Depth Sensing support. The user lays a standard
// ID-1 card (credit card, most ID cards) flat on the ground in frame; since
// its physical size is fixed by ISO/IEC 7810, we can derive a pixel->mm
// scale factor from how many pixels wide it appears.

/** ISO/IEC 7810 ID-1 card dimensions, in millimeters. */
export const CREDIT_CARD_WIDTH_MM = 85.6;
export const CREDIT_CARD_HEIGHT_MM = 53.98;

export interface CalibrationScale {
  /** Real-world millimeters represented by one pixel, at the card's distance from camera. */
  mmPerPixel: number;
  /** Source of the scale, surfaced to the UI/results so accuracy expectations are honest. */
  source: "credit-card" | "depth-sensor";
}

/**
 * Derives mm/pixel from the card's measured pixel width in the captured frame.
 * Throws on a non-positive width so callers don't silently divide by zero.
 */
export function calibrateFromCreditCard(observedPixelWidth: number): CalibrationScale {
  if (!(observedPixelWidth > 0)) {
    throw new Error("larghezza in pixel della carta non valida");
  }
  return {
    mmPerPixel: CREDIT_CARD_WIDTH_MM / observedPixelWidth,
    source: "credit-card",
  };
}

/** Derives mm/pixel from a WebXR metric depth sample + the camera's focal length in pixels. */
export function calibrateFromDepth(depthMeters: number, focalLengthPx: number): CalibrationScale {
  if (!(depthMeters > 0) || !(focalLengthPx > 0)) {
    throw new Error("parametri di profondità non validi");
  }
  // Pinhole camera model: real-world size = pixels * depth / focalLength.
  // So mm-per-pixel at this depth = (depth_m * 1000 / focalLengthPx).
  return {
    mmPerPixel: (depthMeters * 1000) / focalLengthPx,
    source: "depth-sensor",
  };
}
