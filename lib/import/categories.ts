// Default categories from the code prefix, used when a sheet has no category
// column. Companies can rename or change any category afterwards.

const PREFIXES: Record<string, string> = {
  EX: "Excavation & disposal",
  SB: "Sub-base",
  BP: "Block paving",
  KB: "Kerbs & edging",
  PT: "Patios",
  TM: "Tarmac & resin",
  CO: "Concrete",
  DR: "Drainage",
  LB: "Labour & plant",
  PL: "Skips & site",
  MI: "Miscellaneous",
  TF: "Turf & soil",
  TS: "Turf & soil",
  FN: "Fencing",
  DK: "Decking",
  SL: "Sleepers & beds",
  GR: "Gravel",
  MN: "Maintenance",
};

export function categoryFor(code: string): string | null {
  return PREFIXES[code.slice(0, 2).toUpperCase()] ?? null;
}
