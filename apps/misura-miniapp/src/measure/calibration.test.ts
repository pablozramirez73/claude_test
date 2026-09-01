import { describe, expect, it } from "vitest";
import { CREDIT_CARD_WIDTH_MM, calibrateFromCreditCard, calibrateFromDepth } from "./calibration";

describe("calibrateFromCreditCard", () => {
  it("derives mm/pixel from the card's known physical width", () => {
    const scale = calibrateFromCreditCard(428); // e.g. card spans 428px in frame
    expect(scale.mmPerPixel).toBeCloseTo(CREDIT_CARD_WIDTH_MM / 428, 6);
    expect(scale.source).toBe("credit-card");
  });

  it("rejects a non-positive observed width", () => {
    expect(() => calibrateFromCreditCard(0)).toThrow();
    expect(() => calibrateFromCreditCard(-10)).toThrow();
  });
});

describe("calibrateFromDepth", () => {
  it("derives mm/pixel via the pinhole camera model", () => {
    // depth 2m, focal length 1000px -> 2000mm / 1000px = 2mm/px
    const scale = calibrateFromDepth(2, 1000);
    expect(scale.mmPerPixel).toBeCloseTo(2, 6);
    expect(scale.source).toBe("depth-sensor");
  });

  it("rejects invalid parameters", () => {
    expect(() => calibrateFromDepth(0, 1000)).toThrow();
    expect(() => calibrateFromDepth(2, 0)).toThrow();
  });
});
