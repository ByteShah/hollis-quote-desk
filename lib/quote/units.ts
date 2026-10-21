// Unit handling lives in code, not in the model. The AI reports what the
// customer actually said ("20ft by 15ft"); we do the conversion.

export type CanonicalUnit = "m2" | "m" | "m3" | "each" | "job" | "day" | "load" | "tonne";

export type LengthUnit = "m" | "cm" | "mm" | "ft" | "in" | "yd";

const LENGTH_TO_M: Record<LengthUnit, number> = {
  m: 1,
  cm: 0.01,
  mm: 0.001,
  ft: 0.3048,
  in: 0.0254,
  yd: 0.9144,
};

const DIMENSIONS: Partial<Record<CanonicalUnit, number>> = { m: 1, m2: 2, m3: 3 };

/** Normalise the many spellings in Shaz's sheet (and in emails) to one unit. */
export function normaliseUnit(raw: string): CanonicalUnit | null {
  const u = raw.trim().toLowerCase().replace(/\s+/g, " ").replace("²", "2").replace("³", "3");
  if (["m2", "sqm", "sq m", "sq. m", "square metres", "square meters", "m sq"].includes(u)) return "m2";
  if (["m", "lin m", "lm", "linear m", "metre", "metres", "meter", "meters", "lin. m"].includes(u)) return "m";
  if (["m3", "cu m", "cubic metres", "cubic meters"].includes(u)) return "m3";
  if (["each", "ea", "no", "nr", "item"].includes(u)) return "each";
  if (["job", "per job"].includes(u)) return "job";
  if (["day", "per day", "days"].includes(u)) return "day";
  if (["load", "per load", "loads"].includes(u)) return "load";
  if (["tonne", "per tonne", "t", "tonnes", "ton"].includes(u)) return "tonne";
  return null;
}

/** Stated quantities in other units (sq ft, ft, yd...) converted to a canonical unit. */
const STATED_CONVERSIONS: Record<string, { to: CanonicalUnit; factor: number }> = {
  "ft2": { to: "m2", factor: 0.3048 ** 2 },
  "sq ft": { to: "m2", factor: 0.3048 ** 2 },
  "sqft": { to: "m2", factor: 0.3048 ** 2 },
  "square feet": { to: "m2", factor: 0.3048 ** 2 },
  "yd2": { to: "m2", factor: 0.9144 ** 2 },
  "sq yd": { to: "m2", factor: 0.9144 ** 2 },
  "ft": { to: "m", factor: 0.3048 },
  "feet": { to: "m", factor: 0.3048 },
  "yd": { to: "m", factor: 0.9144 },
  "yards": { to: "m", factor: 0.9144 },
  "ft3": { to: "m3", factor: 0.3048 ** 3 },
  "cu ft": { to: "m3", factor: 0.3048 ** 3 },
};

export function convertStated(value: number, rawUnit: string): { value: number; unit: CanonicalUnit } | null {
  const canonical = normaliseUnit(rawUnit);
  if (canonical) return { value, unit: canonical };
  const conv = STATED_CONVERSIONS[rawUnit.trim().toLowerCase()];
  if (!conv) return null;
  return { value: value * conv.factor, unit: conv.to };
}

export type Dimension = { value: number; unit: LengthUnit };

/**
 * Multiply dimensions out in metres. One dimension is a length, two an area,
 * three a volume; that has to match the unit the rate is priced in.
 */
export function quantityFromDimensions(
  dims: Dimension[],
  rateUnit: CanonicalUnit,
): { ok: true; qty: number } | { ok: false; reason: string } {
  const expected = DIMENSIONS[rateUnit];
  if (!expected) return { ok: false, reason: `rate is priced per ${rateUnit}, which can't be measured from dimensions` };
  if (dims.length !== expected) {
    return { ok: false, reason: `rate is per ${rateUnit} but ${dims.length} dimension(s) were given` };
  }
  let qty = 1;
  for (const d of dims) {
    if (!(d.value > 0)) return { ok: false, reason: "dimensions must be positive" };
    qty *= d.value * LENGTH_TO_M[d.unit];
  }
  return { ok: true, qty: roundQty(qty) };
}

export function roundQty(q: number): number {
  return Math.round(q * 100) / 100;
}
