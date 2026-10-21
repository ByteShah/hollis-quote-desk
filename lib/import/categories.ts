// Default categories when a sheet has no category column: first from what the
// item is called (works for any company), then from common code prefixes.
// Companies can rename or change any category afterwards.

const KEYWORDS: [RegExp, string][] = [
  [/\b(kerb|edging)\b/i, "Kerbs & edging"],
  [/\bblock pav|\bpaving\b|\bsett/i, "Block paving"],
  [/\bpatio|\bporcelain|\bsandstone|\bslab(s)?\b(?!.*concrete)/i, "Patios"],
  [/\btarmac|\bresin|\basphalt|\boverlay/i, "Tarmac & resin"],
  [/\bconcrete|\bready ?mix/i, "Concrete"],
  [/\bdrain|\bgully|\bsoakaway|\bcctv|\bchannel|\bsewer/i, "Drainage"],
  [/\bsub-?base|\btype 1\b|\bmot\b|\bgeotextile|\bmembrane/i, "Sub-base"],
  [/\bexcavat|\bdig\b|\bmuck|\bbreak out|\bgrab\b|\breduce levels/i, "Excavation & disposal"],
  [/\bskip|\bsite setup|\bwelfare/i, "Skips & site"],
  [/\bgang\b|\blabour|\bdigger|\bman\b/i, "Labour & plant"],
  [/\bturf|\btopsoil|\blawn|\bseed/i, "Turf & soil"],
  [/\bfenc|\bpanel/i, "Fencing"],
  [/\bdeck/i, "Decking"],
  [/\bsleeper|\braised bed/i, "Sleepers & beds"],
  [/\bgravel|\bshingle|\bchipping/i, "Gravel"],
  [/\bmaintenance|\bhedge|\bpruning/i, "Maintenance"],
];

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
  TF: "Turf & soil",
  TS: "Turf & soil",
  FN: "Fencing",
  DK: "Decking",
  SL: "Sleepers & beds",
  GR: "Gravel",
  MN: "Maintenance",
};

export function categoryFor(code: string, item = ""): string | null {
  // Code prefixes first where we know them (most reliable), then the name.
  const byPrefix = PREFIXES[code.slice(0, 2).toUpperCase()];
  if (byPrefix) return byPrefix;
  for (const [re, cat] of KEYWORDS) if (re.test(item)) return cat;
  return code.toUpperCase().startsWith("MI") ? "Miscellaneous" : null;
}
