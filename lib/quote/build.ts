import type { AiDraft } from "@/lib/ai/schema";
import { lineTotalPence, toPence, toPounds, vatPence } from "./money";
import { convertStated, quantityFromDimensions, roundQty, type CanonicalUnit } from "./units";

// Turns the model's proposal into a priced draft. Every number that ends up on
// the quote is computed here from the company's own rates; the model only
// chose codes and reported measurements.

export type RateModifier = { id: string; label: string; amount: number; per: "unit" | "flat" };

export type Rate = {
  code: string;
  item: string;
  unit: CanonicalUnit;
  rate_ex_vat: number | null;
  status: "active" | "archived" | "price_on_request" | "not_offered";
  notes: string | null;
  modifiers: RateModifier[];
  /** m³ in one load: volumes become whole loads, part loads charged as full. */
  load_size?: number | null;
  /** Codes this item is already part of; never charged alongside them. */
  included_in?: string[];
  /** Using this item means someone has to see the job first. */
  site_visit_reason?: string | null;
};

export type CompanyPricing = { vat_rate: number; min_charge: number; auto_quote_max_m2: number };

export type QuoteLine = {
  rate_code: string | null;
  description: string;
  qty: number;
  unit: string;
  unit_rate: number;
  line_total: number;
  source: "ai" | "human" | "system";
  note: string | null;
};

export type Flag = { level: "info" | "warning" | "danger"; message: string };

export type Exclusion = { request: string; reason: string; note: string };

export type Outcome = AiDraft["outcome"];

export type BuiltQuote = {
  outcome: Outcome;
  /** What the AI proposed, before code applied the company's rules. */
  aiOutcome: Outcome;
  /** Why it's a site visit: "ai", "area:EX01", "item:TM02". Empty when priced. */
  siteVisitBy: string[];
  /** Proposed lines code refused, as "CODE:reason". */
  dropped: string[];
  lines: QuoteLine[];
  exclusions: Exclusion[];
  flags: Flag[];
  subtotal: number;
  vat: number;
  total: number;
};

export const MIN_CHARGE_CODE = "MIN";

// Phrases that only make sense if someone is trying to steer an automated
// system. Checked in code too, so we don't rely on the model to report itself.
const INJECTION_PATTERNS = [
  /ignore (all|any|previous|prior) (instructions|rules)/i,
  /\b(automated|ai)\b[^.\n]{0,40}\b(assistant|system|quoting|tool)s?\b/i,
  /\bmark (this|the) quote as approved\b/i,
  /\bapply (a|an)?\s*\d{1,3}\s*%/i,
  /\bwaive (any|the) minimum\b/i,
  /\bdo not mention this\b/i,
];

export function detectInjection(text: string): string[] {
  return INJECTION_PATTERNS.filter((p) => p.test(text)).map((p) => {
    const m = text.match(p);
    return m ? m[0] : p.source;
  });
}

export function buildQuote(
  draft: AiDraft,
  rates: Rate[],
  company: CompanyPricing,
  enquiryText: string,
): BuiltQuote {
  const byCode = new Map(rates.map((r) => [r.code.toUpperCase(), r]));
  const flags: Flag[] = [];
  const exclusions: Exclusion[] = draft.excluded_items.map((e) => ({ ...e }));
  const lines: QuoteLine[] = [];
  let outcome: Outcome = draft.outcome;
  const siteVisitBy: string[] = draft.outcome === "needs_site_visit" ? ["ai"] : [];
  const dropped: string[] = [];

  for (const l of draft.lines) {
    const rate = byCode.get(l.rate_code.trim().toUpperCase());
    if (!rate) {
      flags.push({ level: "warning", message: `AI proposed unknown rate code "${l.rate_code}"; dropped. (${l.reasoning})` });
      dropped.push(`${l.rate_code.slice(0, 20)}:unknown`);
      continue;
    }
    if (rate.status === "not_offered") {
      exclusions.push({ request: rate.item, reason: "not_offered", note: rate.notes ?? "We don't offer this." });
      continue;
    }
    if (rate.site_visit_reason) {
      outcome = "needs_site_visit";
      siteVisitBy.push(`item:${rate.code}`);
      flags.push({ level: "warning", message: `${rate.code} (${rate.item}) needs a site visit: ${rate.site_visit_reason}` });
      continue;
    }
    if (rate.status !== "active" || rate.rate_ex_vat == null) {
      exclusions.push({
        request: rate.item,
        reason: "no_price",
        note: `${rate.code} has no confirmed price (${rate.notes ?? rate.status}). Needs pricing by hand.`,
      });
      continue;
    }

    let qty: number;
    let loadNote = "";
    if (rate.unit === "load" && rate.load_size) {
      const loads = loadsFor(l, rate.load_size);
      if (!loads.ok) {
        flags.push({ level: "warning", message: `${rate.code}: ${loads.reason}; line dropped, add by hand.` });
        dropped.push(`${rate.code}:quantity`);
        continue;
      }
      qty = loads.qty;
      loadNote = loads.note;
    } else if (l.quantity_source === "dimensions" && l.dimensions.length > 0) {
      const r = quantityFromDimensions(l.dimensions, rate.unit);
      if (!r.ok) {
        flags.push({ level: "warning", message: `${rate.code}: couldn't work out quantity (${r.reason}); line dropped, add by hand.` });
        dropped.push(`${rate.code}:quantity`);
        continue;
      }
      qty = r.qty;
    } else {
      const conv =
        l.stated_quantity != null && l.stated_unit ? convertStated(l.stated_quantity, l.stated_unit) : null;
      if (!conv || conv.unit !== rate.unit) {
        flags.push({
          level: "warning",
          message: `${rate.code}: quantity "${l.stated_quantity ?? "?"} ${l.stated_unit ?? ""}" doesn't fit a per-${rate.unit} rate; line dropped, add by hand.`,
        });
        dropped.push(`${rate.code}:unit`);
        continue;
      }
      qty = roundQty(conv.value);
    }
    if (!(qty > 0)) {
      flags.push({ level: "warning", message: `${rate.code}: zero quantity; line dropped.` });
      dropped.push(`${rate.code}:zero`);
      continue;
    }

    let unitRate = rate.rate_ex_vat;
    const extras: string[] = [];
    const flatExtras: QuoteLine[] = [];
    for (const modId of l.modifiers) {
      const mod = rate.modifiers.find((m) => m.id === modId);
      if (!mod) {
        flags.push({ level: "warning", message: `${rate.code}: ignored unknown modifier "${modId}".` });
        continue;
      }
      if (mod.per === "unit") {
        unitRate += mod.amount;
        extras.push(mod.label);
      } else {
        // Customer-facing description; the rate it belongs to goes in the internal note.
        flatExtras.push(systemLine(null, mod.label, 1, "each", mod.amount, "ai", `Extra for ${rate.code}. ${l.reasoning}`));
      }
    }

    const description = extras.length ? `${rate.item} (${extras.join(", ")})` : rate.item;
    // A flat extra (the skip's road permit) follows the line it belongs to.
    lines.push(systemLine(rate.code, description, qty, rate.unit, unitRate, "ai", l.reasoning + loadNote), ...flatExtras);

    // Optional extras the AI didn't add: remind the reviewer they exist.
    for (const mod of rate.modifiers.filter((m) => !l.modifiers.includes(m.id))) {
      flags.push({
        level: "info",
        message: `${rate.code}: "${mod.label}" (+£${mod.amount}${mod.per === "unit" ? `/${rate.unit}` : ""}) not added. Add it if it applies.`,
      });
    }

    // One note per line: an estimate and low confidence usually share the same reasoning.
    if (l.quantity_source === "estimate" || l.confidence === "low") {
      const what = l.quantity_source === "estimate" ? "quantity is an AI estimate" : "AI is unsure about this line";
      flags.push({
        level: l.confidence === "low" ? "warning" : "info",
        message: `${rate.code}: ${what}${l.quantity_source === "estimate" && l.confidence === "low" ? " (low confidence)" : ""}; check it. ${l.reasoning}`,
      });
    }
    if (rate.unit === "m2" && qty > company.auto_quote_max_m2) {
      outcome = "needs_site_visit";
      siteVisitBy.push(`area:${rate.code}`);
      flags.push({
        level: "warning",
        message: `${rate.code} is ${qty} m², over the ${company.auto_quote_max_m2} m² limit for quoting off an email; needs a site visit.`,
      });
    }
  }

  // Items already included in another line on this quote aren't charged twice.
  const onQuote = new Set(lines.map((l) => l.rate_code).filter(Boolean));
  for (let i = lines.length - 1; i >= 0; i--) {
    const code = lines[i].rate_code;
    const parent = code ? byCode.get(code)?.included_in?.find((c) => onQuote.has(c.toUpperCase())) : undefined;
    if (parent) {
      flags.push({ level: "info", message: `${code} removed: it's already included in ${parent}.` });
      lines.splice(i, 1);
    }
  }

  const suspicious = [...draft.suspicious_instructions, ...detectInjection(enquiryText)];
  if (suspicious.length) {
    flags.push({
      level: "danger",
      message: `The enquiry contains text aimed at automated systems; it was ignored. Check it before replying: ${[
        ...new Set(suspicious),
      ]
        .map((s) => `"${s}"`)
        .join("; ")}`,
    });
  }

  const meta = { aiOutcome: draft.outcome, siteVisitBy, dropped };
  if (outcome !== "quote") {
    // Never put a number on a job that needs a site visit or can't be priced.
    if (outcome === "needs_site_visit" && siteVisitBy.length === 1 && siteVisitBy[0] === "ai") {
      flags.push({
        level: "warning",
        message:
          "The AI chose a site visit, but none of your site-visit rules apply (size, car park or commercial, or a site-visit item). If you're happy to price it, use the AI's proposed lines below.",
      });
    }
    return { outcome, ...meta, lines: [], exclusions, flags, subtotal: 0, vat: 0, total: 0 };
  }
  if (lines.length === 0) {
    flags.push({ level: "warning", message: "Nothing in this enquiry could be priced from the rates." });
    return { outcome: "cannot_quote", ...meta, lines: [], exclusions, flags, subtotal: 0, vat: 0, total: 0 };
  }

  return { outcome, ...meta, exclusions, flags, ...priceLines(lines, company) };
}

/**
 * Quantity for an item priced per load of a known size. A volume (three
 * dimensions or a stated m³) becomes whole loads, rounded up: a part load is
 * charged as a full one.
 */
function loadsFor(l: AiDraft["lines"][number], size: number): { ok: true; qty: number; note: string } | { ok: false; reason: string } {
  let volume: number | null = null;
  if (l.quantity_source === "dimensions" && l.dimensions.length > 0) {
    const r = quantityFromDimensions(l.dimensions, "m3");
    if (!r.ok) return { ok: false, reason: `couldn't work out the volume (${r.reason})` };
    volume = r.qty;
  } else if (l.stated_quantity != null && l.stated_unit) {
    const c = convertStated(l.stated_quantity, l.stated_unit);
    if (c?.unit === "load") return { ok: true, qty: Math.ceil(c.value), note: "" };
    if (c?.unit === "m3") volume = roundQty(c.value);
  }
  if (volume == null || !(volume > 0)) return { ok: false, reason: "needs a volume in m³ or a number of loads" };
  const qty = Math.ceil(volume / size);
  return { ok: true, qty, note: ` ${volume} m³ at ${size} m³ a load = ${qty} load${qty === 1 ? "" : "s"} (part loads charged as full).` };
}

function systemLine(
  rate_code: string | null,
  description: string,
  qty: number,
  unit: string,
  unit_rate: number,
  source: QuoteLine["source"],
  note: string | null,
): QuoteLine {
  return {
    rate_code,
    description,
    qty,
    unit,
    unit_rate,
    line_total: toPounds(lineTotalPence(toPence(unit_rate), qty)),
    source,
    note,
  };
}

/**
 * Recalculates every line total, the minimum-charge top-up and VAT. Used for
 * the first draft and again after every human edit, so totals are always
 * derived, never typed in.
 */
export function priceLines(
  input: QuoteLine[],
  company: Pick<CompanyPricing, "vat_rate" | "min_charge">,
): { lines: QuoteLine[]; subtotal: number; vat: number; total: number } {
  const lines = input
    .filter((l) => l.rate_code !== MIN_CHARGE_CODE)
    .map((l) => ({ ...l, line_total: toPounds(lineTotalPence(toPence(l.unit_rate), l.qty)) }));

  let subtotalP = lines.reduce((s, l) => s + toPence(l.line_total), 0);
  const minP = toPence(company.min_charge);
  if (lines.length && subtotalP < minP) {
    const topUp = minP - subtotalP;
    lines.push({
      rate_code: MIN_CHARGE_CODE,
      description: `Minimum charge adjustment (£${company.min_charge.toFixed(2)} minimum per job)`,
      qty: 1,
      unit: "job",
      unit_rate: toPounds(topUp),
      line_total: toPounds(topUp),
      source: "system",
      note: null,
    });
    subtotalP = minP;
  }
  const vatP = vatPence(subtotalP, company.vat_rate);
  return { lines, subtotal: toPounds(subtotalP), vat: toPounds(vatP), total: toPounds(subtotalP + vatP) };
}
