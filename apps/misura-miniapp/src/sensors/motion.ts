// Uses DeviceMotionEvent to confirm the phone is resting still (propped up
// against something 2-2.5m away, per the scan instructions) before we trust
// a captured frame for measurement. This is the accelerometer/gyroscope
// layer from the architecture doc (§5 Sensor Layer).

export interface MotionSample {
  x: number;
  y: number;
  z: number;
}

const STABILITY_WINDOW_MS = 800;
/** Max acceleration variance (m/s^2, squared) tolerated to call the device "stable". */
const STABILITY_VARIANCE_THRESHOLD = 0.6;

export type MotionPermissionState = "granted" | "denied" | "unsupported";

/** iOS 13+ requires an explicit user-gesture-triggered permission request. */
export async function requestMotionPermission(): Promise<MotionPermissionState> {
  type MotionEventConstructorWithPermission = typeof DeviceMotionEvent & {
    requestPermission?: () => Promise<"granted" | "denied">;
  };
  const ctor = (typeof DeviceMotionEvent !== "undefined"
    ? DeviceMotionEvent
    : undefined) as MotionEventConstructorWithPermission | undefined;

  if (!ctor) return "unsupported";
  if (typeof ctor.requestPermission !== "function") {
    // Android / desktop browsers: no explicit permission gate.
    return "granted";
  }
  try {
    const result = await ctor.requestPermission();
    return result;
  } catch {
    return "denied";
  }
}

function variance(samples: number[]): number {
  if (samples.length === 0) return Infinity;
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  return samples.reduce((acc, v) => acc + (v - mean) ** 2, 0) / samples.length;
}

/**
 * Resolves once the device has held still for STABILITY_WINDOW_MS, or rejects
 * if `timeoutMs` elapses first (caller should let the user retry / skip to
 * the credit-card fallback flow).
 */
export function waitForStableDevice(timeoutMs = 8000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !("DeviceMotionEvent" in window)) {
      // No motion sensor available (desktop dev, unsupported browser) —
      // don't block the flow, just skip the stability gate.
      resolve();
      return;
    }

    const xs: number[] = [];
    const ys: number[] = [];
    const zs: number[] = [];
    let windowStart = performance.now();
    let settled = false;

    const timeout = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      window.removeEventListener("devicemotion", handler);
      reject(new Error("timeout waiting for stable device"));
    }, timeoutMs);

    function handler(event: DeviceMotionEvent) {
      const acc = event.accelerationIncludingGravity ?? event.acceleration;
      if (!acc) return;
      const now = performance.now();
      xs.push(acc.x ?? 0);
      ys.push(acc.y ?? 0);
      zs.push(acc.z ?? 0);

      if (now - windowStart >= STABILITY_WINDOW_MS) {
        const isStable =
          variance(xs) < STABILITY_VARIANCE_THRESHOLD &&
          variance(ys) < STABILITY_VARIANCE_THRESHOLD &&
          variance(zs) < STABILITY_VARIANCE_THRESHOLD;

        if (isStable && !settled) {
          settled = true;
          window.clearTimeout(timeout);
          window.removeEventListener("devicemotion", handler);
          resolve();
          return;
        }

        // Slide the window forward and keep sampling.
        xs.length = 0;
        ys.length = 0;
        zs.length = 0;
        windowStart = now;
      }
    }

    window.addEventListener("devicemotion", handler);
  });
}
