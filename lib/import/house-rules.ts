// Judgement calls the importer makes on any price list, the same ones made by
// hand on Hollis's original sheet. Each one is shown as a warning in the
// preview, so the person importing can see it and undo it afterwards.
// A Status column in the file always wins over these rules.

export type RuleRate = {
  code: string;
  item: string;
  unit: string;
  status: "active" | "price_on_request" | "not_offered" | "archived";
  notes: string | null;
  price: number | null;
  modifiers: { id: string; label: string; amount: number; per: "unit" | "flat" }[];
};

export type RuleRow = { value: RuleRate; warnings: string[]; explicitStatus: boolean };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "extra";
const AREA_UNITS = new Set(["m2", "m", "m3"]);

/** "herringbone +£4" or "needs permit if on road, +£60" → a selectable extra. */
export function extrasFromNotes(notes: string | null, unit: string): RuleRate["modifiers"] {
  if (!notes) return [];
  const out: RuleRate["modifiers"] = [];
  const re = /([^,;+]*?)[,;]?\s*\+\s*£\s*(\d+(?:\.\d{1,2})?)/g;
  let m: RegExpExecArray | null;
  const parts = notes.split(/[,;]/).map((p) => p.trim());
  while ((m = re.exec(notes))) {
    let label = m[1].trim();
    // "needs permit if on road, +£60": the label is the clause before the comma.
    if (!label) {
      const idx = parts.findIndex((p) => p.startsWith("+") || p.includes(`+£${m![2]}`));
      label = (idx > 0 ? parts[idx - 1] : "").trim();
    }
    if (!label) continue;
    label = label.replace(/\s+/g, " ");
    out.push({ id: slug(label), label: label[0].toUpperCase() + label.slice(1), amount: Number(m[2]), per: AREA_UNITS.has(unit) && !/\bif\b|permit/i.test(label) ? "unit" : "flat" });
  }
  return out;
}

export function applyHouseRules(rows: RuleRow[]): void {
  for (const r of rows) {
    const v = r.value;
    const notes = v.notes ?? "";

    const extras = extrasFromNotes(v.notes, v.unit);
    if (extras.length && !v.modifiers.length) {
      v.modifiers = extras;
      r.warnings.push(`Extras read from the note: ${extras.map((e) => `${e.label} +£${e.amount}${e.per === "unit" ? `/${v.unit}` : " per job"}`).join(", ")}.`);
    }
    if (r.explicitStatus) continue;

    if (/minimum charge/i.test(v.item) && v.status === "active") {
      v.status = "archived";
      r.warnings.push("The minimum charge is applied automatically (Settings → General), so this item is archived to avoid charging it twice.");
      continue;
    }
    const included = notes.match(/included in\s+([A-Z]{1,4}\d{1,4})/i);
    if (included && v.status === "active") {
      v.status = "archived";
      r.warnings.push(`The note says it's usually included in ${included[1].toUpperCase()}, so it's archived and won't be charged twice. Restore it if you sometimes charge it separately.`);
      continue;
    }
    if (/\?\?|\bcheck\b/i.test(notes) && v.status === "active") {
      v.status = "price_on_request";
      r.warnings.push("The note asks for this price to be checked, so it won't be used on quotes until someone confirms it.");
    }
  }

  // Likely duplicates: same unit, and one name is the other or starts with it
  // ("Edging kerb" / "Edging kerb 150x50 on concrete haunch"). Keep the one
  // marked new/current, otherwise the higher price (under-quoting costs more
  // than over-quoting), and archive the rest.
  const active = rows.filter((r) => r.value.status === "active" && !r.explicitStatus);
  const used = new Set<RuleRow>();
  for (const a of active) {
    if (used.has(a)) continue;
    const na = norm(a.value.item);
    const group = active.filter((b) => {
      if (used.has(b) || b.value.unit !== a.value.unit) return false;
      const nb = norm(b.value.item);
      return na === nb || na.startsWith(nb + " ") || nb.startsWith(na + " ");
    });
    if (group.length < 2) continue;
    group.forEach((g) => used.add(g));
    const newest = group.find((g) => /\bnew\b|\bcurrent\b|\blatest\b/i.test(g.value.notes ?? ""));
    const keep = newest ?? [...group].sort((x, y) => (y.value.price ?? 0) - (x.value.price ?? 0))[0];
    for (const g of group) {
      if (g === keep) continue;
      g.value.status = "archived";
      g.warnings.push(
        `Looks like a duplicate of ${keep.value.code} (same item and unit). Kept ${keep.value.code} (${newest ? "marked as the new price" : "the higher price"}) and archived this one. Restore it if both are needed.`,
      );
    }
    keep.warnings.push(`Kept over possible duplicate${group.length > 2 ? "s" : ""} ${group.filter((g) => g !== keep).map((g) => g.value.code).join(", ")}.`);
  }
}
