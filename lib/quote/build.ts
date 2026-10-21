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
  status: "active" | "superseded" | "price_on_request" | "not_offered";
  notes: string | null;
  modifiers: RateModifier[];
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

  for (const l of draft.lines) {
    const rate = byCode.get(l.rate_code.trim().toUpperCase());
    if (!rate) {
      flags.push({ level: "warning", message: `AI proposed unknown rate code "${l.rate_code}"; dropped. (${l.reasoning})` });
      continue;
    }
    if (rate.status === "not_offered") {
      exclusions.push({ request: rate.item, reason: "not_offered", note: rate.notes ?? "We don't offer this." });
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
    if (l.quantity_source === "dimensions" && l.dimensions.length > 0) {
      const r = quantityFromDimensions(l.dimensions, rate.unit);
      if (!r.ok) {
        flags.push({ level: "warning", message: `${rate.code}: couldn't work out quantity (${r.reason}); line dropped, add by hand.` });
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
        continue;
      }
      qty = roundQty(conv.value);
    }
    if (!(qty > 0)) {
      flags.push({ level: "warning", message: `${rate.code}: zero quantity; line dropped.` });
      continue;
    }

    let unitRate = rate.rate_ex_vat;
    const extras: string[] = [];
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
        lines.push(systemLine(null, `${mod.label} (${rate.code})`, 1, "each", mod.amount, "ai", l.reasoning));
      }
    }

    const description = extras.length ? `${rate.item} (${extras.join(", ")})` : rate.item;
    lines.push(systemLine(rate.code, description, qty, rate.unit, unitRate, "ai", l.reasoning));

    if (l.quantity_source === "estimate") {
      flags.push({ level: "info", message: `${rate.code}: quantity is an AI estimate; check it. ${l.reasoning}` });
    }
    if (l.confidence === "low") {
      flags.push({ level: "warning", message: `${rate.code}: low confidence. ${l.reasoning}` });
    }
    if (rate.unit === "m2" && qty > company.auto_quote_max_m2) {
      outcome = "needs_site_visit";
      flags.push({
        level: "warning",
        message: `${rate.code} is ${qty} m², over the ${company.auto_quote_max_m2} m² limit for quoting off an email; needs a site visit.`,
      });
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

  if (outcome !== "quote") {
    // Never put a number on a job that needs a site visit or can't be priced.
    if (lines.length) {
      flags.push({ level: "info", message: `${lines.length} proposed line(s) withheld because this job isn't being priced off the enquiry.` });
    }
    return { outcome, lines: [], exclusions, flags, subtotal: 0, vat: 0, total: 0 };
  }
  if (lines.length === 0) {
    flags.push({ level: "warning", message: "Nothing in this enquiry could be priced from the rates." });
    return { outcome: "cannot_quote", lines: [], exclusions, flags, subtotal: 0, vat: 0, total: 0 };
  }

  return { outcome, exclusions, flags, ...priceLines(lines, company) };
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
