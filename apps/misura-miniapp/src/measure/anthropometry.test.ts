import { describe, expect, it } from "vitest";
import { ellipseCircumference, estimateCircumference, landmarkDistancePx } from "./anthropometry";
import type { CalibrationScale } from "./calibration";

describe("ellipseCircumference", () => {
  it("reduces to a circle's circumference when both semi-axes are equal", () => {
    const r = 10;
    expect(ellipseCircumference(r, r)).toBeCloseTo(2 * Math.PI * r, 5);
  });

  it("throws on non-positive semi-axes", () => {
    expect(() => ellipseCircumference(0, 5)).toThrow();
    expect(() => ellipseCircumference(5, -1)).toThrow();
  });

  it("matches Ramanujan's approximation for a known elongated ellipse", () => {
    // a=10, b=5 -> Ramanujan's 2nd approximation is well documented at ~48.44
    expect(ellipseCircumference(10, 5)).toBeCloseTo(48.44, 1);
  });
});

describe("estimateCircumference", () => {
  const scale: CalibrationScale = { mmPerPixel: 2, source: "credit-card" };

  it("is larger with a measured depth than with the anthropometric ratio fallback, for a non-circular body", () => {
    // width 200px * 2mm/px = 400mm wide. A measured depth close to the width
    // (i.e. rounder cross-section) should yield a bigger circumference than
    // the flatter "waist" ratio (0.72) fallback would.
    const withMeasuredDepth = estimateCircumference(200, scale, "waist", 190);
    const withFallbackRatio = estimateCircumference(200, scale, "waist");

    expect(withMeasuredDepth.usedMeasuredDepth).toBe(true);
    expect(withFallbackRatio.usedMeasuredDepth).toBe(false);
    expect(withMeasuredDepth.circumferenceCm).toBeGreaterThan(withFallbackRatio.circumferenceCm);
  });

  it("produces a plausible adult waist circumference from realistic pixel inputs", () => {
    // 400mm frontal width is a plausible adult waist half-width scenario.
    const result = estimateCircumference(200, scale, "waist");
    expect(result.circumferenceCm).toBeGreaterThan(60);
    expect(result.circumferenceCm).toBeLessThan(140);
  });

  it("rejects a non-positive pixel width", () => {
    expect(() => estimateCircumference(0, scale, "chest")).toThrow();
  });
});

describe("landmarkDistancePx", () => {
  it("computes Euclidean distance scaled from normalized coordinates to pixels", () => {
    const a = { x: 0, y: 0 };
    const b = { x: 0.5, y: 0 };
    // Half the frame width, horizontally only.
    expect(landmarkDistancePx(a, b, 1000, 1000)).toBeCloseTo(500, 5);
  });

  it("is symmetric", () => {
    const a = { x: 0.2, y: 0.3 };
    const b = { x: 0.7, y: 0.9 };
    expect(landmarkDistancePx(a, b, 800, 600)).toBeCloseTo(landmarkDistancePx(b, a, 800, 600), 5);
  });
});
