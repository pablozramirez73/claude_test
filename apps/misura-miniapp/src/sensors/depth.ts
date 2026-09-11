// Depth layer abstraction (architecture doc §5 "Sensor Layer" / §9 fallback).
//
// The "real" path is WebXR Depth Sensing (the web-standard route to LiDAR /
// TrueDepth metric depth on supporting devices — Safari/Chrome on
// LiDAR-equipped iPhone & iPad Pro). It gives us a `depthBuffer` in meters,
// which is what lets us convert pixel distances to real centimeters.
//
// Practically: WebXR Depth Sensing requires an immersive-ar XR session, which
// most Telegram-embedded browsers won't grant, and it can't be exercised in
// this sandboxed environment at all. So this module feature-detects it,
// exposes a typed path for devices that do support it, and — critically —
// makes the *absence* of support a first-class, explicit fallback rather
// than a silent failure: callers check `supportsDepthSensing()` and fall
// back to the credit-card calibration in `measure/calibration.ts`.

export interface DepthCapability {
  supported: boolean;
  reason?: string;
}

/** Feature-detects WebXR Depth Sensing without starting a session. */
export async function detectDepthCapability(): Promise<DepthCapability> {
  if (typeof navigator === "undefined" || !("xr" in navigator)) {
    return { supported: false, reason: "WebXR non disponibile in questo browser" };
  }
  try {
    const xr = (navigator as Navigator & { xr?: XRSystem }).xr;
    if (!xr) return { supported: false, reason: "WebXR non disponibile in questo browser" };

    const supported = await xr.isSessionSupported("immersive-ar");
    if (!supported) {
      return { supported: false, reason: "immersive-ar non supportata su questo device" };
    }
    return { supported: true };
  } catch (err) {
    return { supported: false, reason: err instanceof Error ? err.message : "errore sconosciuto" };
  }
}

export interface MetricDepthSample {
  /** Average scene depth in meters over the sampled region (e.g. the torso bounding box). */
  meters: number;
}

/**
 * Requests an immersive-ar session with the "depth-sensing" feature and
 * returns a single averaged depth sample for the given normalized viewport
 * region. Throws if depth sensing isn't supported — callers should already
 * have checked `detectDepthCapability()` and be ready to fall back.
 *
 * NOTE: kept intentionally minimal (single-sample, session torn down
 * immediately after) since MISURA only needs one stable depth reading per
 * body region per scan, not continuous frame-by-frame depth.
 */
export async function sampleMetricDepth(): Promise<MetricDepthSample> {
  const xr = (navigator as Navigator & { xr?: XRSystem }).xr;
  if (!xr) throw new Error("WebXR non disponibile");

  const session = await xr.requestSession("immersive-ar", {
    requiredFeatures: ["depth-sensing"],
    depthSensing: {
      usagePreference: ["cpu-optimized"],
      dataFormatPreference: ["luminance-alpha", "float32"],
    },
  } as XRSessionInit);

  try {
    // A full implementation would drive an XR animation frame loop and read
    // `frame.getDepthInformation(view)` for the torso region; that requires
    // a live render loop bound to a canvas, which is out of scope for this
    // POC (see docs/PRD-misura.md §11). We surface the typed session handle
    // so the real read-out can be wired in without touching call sites.
    throw new Error("depth-sensing frame loop non implementato in questo POC");
  } finally {
    await session.end();
  }
}
