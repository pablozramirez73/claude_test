import { describe, expect, it } from "vitest";
import { genericSizeChart, recommendSize, recommendSizeAcrossBrands, type SizeChart } from "./sizeChart";

describe("recommendSize", () => {
  it("picks the smallest size covering all measurements", () => {
    expect(recommendSize({ chest: 80, waist: 65, hips: 85 })).toBe("XS");
    expect(recommendSize({ chest: 100, waist: 84, hips: 104 })).toBe("M");
  });

  it("is driven by the largest of the three required sizes", () => {
    // Chest alone would fit S (max 94), but hips need L (max 114).
    expect(recommendSize({ chest: 90, waist: 75, hips: 112 })).toBe("L");
  });

  it("falls back to the largest chart size when the body exceeds every range", () => {
    expect(recommendSize({ chest: 200, waist: 200, hips: 200 })).toBe("XXL");
  });
});

describe("recommendSizeAcrossBrands", () => {
  it("can recommend different sizes for different brand charts, per the product spec", () => {
    const snugBrand: SizeChart = {
      brand: "brand-snug",
      ranges: genericSizeChart.ranges.map((r) => ({
        ...r,
        chestMax: r.chestMax - 6,
        waistMax: r.waistMax - 6,
        hipsMax: r.hipsMax - 6,
      })),
    };

    const measurements = { chest: 100, waist: 84, hips: 104 };
    const results = recommendSizeAcrossBrands(measurements, [genericSizeChart, snugBrand]);

    expect(results).toEqual([
      { brand: "generico", size: "M" },
      { brand: "brand-snug", size: "L" },
    ]);
  });
});
