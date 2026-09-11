// Maps raw body measurements (cm) to a garment size label. Keyed per brand
// so a shop can plug in its own chart (architecture doc §4: "Sei una M
// perfetta per questo brand, S per questo altro"); ships with one sensible
// generic unisex chart as the MVP default.

export interface BodyMeasurementsCm {
  chest: number;
  waist: number;
  hips: number;
}

export type SizeLabel = "XS" | "S" | "M" | "L" | "XL" | "XXL";

interface SizeRange {
  label: SizeLabel;
  chestMax: number;
  waistMax: number;
  hipsMax: number;
}

/** Generic unisex chart, upper bound (cm) per measurement for each size. */
const GENERIC_CHART: SizeRange[] = [
  { label: "XS", chestMax: 86, waistMax: 70, hipsMax: 90 },
  { label: "S", chestMax: 94, waistMax: 78, hipsMax: 98 },
  { label: "M", chestMax: 102, waistMax: 86, hipsMax: 106 },
  { label: "L", chestMax: 110, waistMax: 94, hipsMax: 114 },
  { label: "XL", chestMax: 118, waistMax: 102, hipsMax: 122 },
  { label: "XXL", chestMax: 130, waistMax: 114, hipsMax: 134 },
];

export interface SizeChart {
  brand: string;
  ranges: SizeRange[];
}

export const genericSizeChart: SizeChart = { brand: "generico", ranges: GENERIC_CHART };

/**
 * Picks the smallest size whose upper bounds cover all three measurements.
 * Falls back to the largest size in the chart if the body exceeds every range.
 */
export function recommendSize(measurements: BodyMeasurementsCm, chart: SizeChart = genericSizeChart): SizeLabel {
  const fit = chart.ranges.find(
    (range) =>
      measurements.chest <= range.chestMax &&
      measurements.waist <= range.waistMax &&
      measurements.hips <= range.hipsMax,
  );
  return (fit ?? chart.ranges[chart.ranges.length - 1]).label;
}

/** Recommends a size across several brand charts at once — the multi-brand result shown in the UI. */
export function recommendSizeAcrossBrands(
  measurements: BodyMeasurementsCm,
  charts: SizeChart[],
): { brand: string; size: SizeLabel }[] {
  return charts.map((chart) => ({ brand: chart.brand, size: recommendSize(measurements, chart) }));
}
