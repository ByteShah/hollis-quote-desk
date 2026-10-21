import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildQuote, priceLines, detectInjection, type Rate } from "@/lib/quote/build";
import type { AiDraft, AiLine } from "@/lib/ai/schema";
import { quantityFromDimensions } from "@/lib/quote/units";
import { matchCustomer } from "@/lib/customers/match";
import { dedupeCustomers } from "@/lib/import/customers";

const company = { vat_rate: 0.2, min_charge: 450, auto_quote_max_m2: 150 };

const rates: Rate[] = [
  { code: "EX01", item: "Excavate topsoil", unit: "m2", rate_ex_vat: 14.5, status: "active", notes: null, modifiers: [] },
  {
    code: "BP01",
    item: "Block paving",
    unit: "m2",
    rate_ex_vat: 62,
    status: "active",
    notes: null,
    modifiers: [{ id: "herringbone", label: "herringbone", amount: 4, per: "unit" }],
  },
  {
    code: "PL01",
    item: "Skip 8 yard",
    unit: "each",
    rate_ex_vat: 310,
    status: "active",
    notes: null,
    modifiers: [{ id: "road_permit", label: "Road permit", amount: 60, per: "flat" }],
  },
  { code: "KB04", item: "Dropped kerb", unit: "each", rate_ex_vat: null, status: "not_offered", notes: "council", modifiers: [] },
  { code: "TM03", item: "Resin", unit: "m2", rate_ex_vat: null, status: "price_on_request", notes: "ask Dave", modifiers: [] },
  { code: "TM01", item: "Tarmac", unit: "m2", rate_ex_vat: 55, status: "active", notes: null, modifiers: [] },
];

const line = (o: Partial<AiLine>): AiLine => ({
  rate_code: "EX01",
  quantity_source: "stated",
  dimensions: [],
  stated_quantity: 1,
  stated_unit: "m2",
  modifiers: [],
  reasoning: "",
  confidence: "high",
  ...o,
});

const draft = (o: Partial<AiDraft>): AiDraft => ({
  job_summary: "",
  outcome: "quote",
  outcome_reason: "",
  lines: [],
  excluded_items: [],
  customer_contact: { name: null, phone: null, address: null, postcode: null },
  assumptions: [],
  questions_for_customer: [],
  suspicious_instructions: [],
  ...o,
});

describe("units", () => {
  it("converts feet dimensions to m2 in code", () => {
    const r = quantityFromDimensions(
      [
        { value: 20, unit: "ft" },
        { value: 15, unit: "ft" },
      ],
      "m2",
    );
    expect(r).toEqual({ ok: true, qty: 27.87 });
  });
  it("refuses a length for an area rate", () => {
    expect(quantityFromDimensions([{ value: 3, unit: "m" }], "m2").ok).toBe(false);
  });
});

describe("buildQuote", () => {
  it("prices from the rate table, never from the AI", () => {
    const q = buildQuote(draft({ lines: [line({ rate_code: "bp01", stated_quantity: 30, modifiers: ["herringbone"] })] }), rates, company, "");
    expect(q.lines[0].unit_rate).toBe(66);
    expect(q.subtotal).toBe(1980);
    expect(q.vat).toBe(396);
    expect(q.total).toBe(2376);
  });

  it("tops up to the minimum charge", () => {
    const q = buildQuote(draft({ lines: [line({ stated_quantity: 10 })] }), rates, company, "");
    expect(q.subtotal).toBe(450);
    expect(q.lines.at(-1)!.rate_code).toBe("MIN");
    expect(q.lines.at(-1)!.line_total).toBe(305);
  });

  it("adds the flat road permit as its own line", () => {
    const q = buildQuote(draft({ lines: [line({ rate_code: "PL01", stated_quantity: 1, stated_unit: "each", modifiers: ["road_permit"] })] }), rates, company, "");
    expect(q.lines.map((l) => l.line_total)).toEqual([60, 310, 80]);
  });

  it("turns not-offered and unpriced rates into exclusions", () => {
    const q = buildQuote(
      draft({
        lines: [
          line({ rate_code: "KB04", stated_unit: "each" }),
          line({ rate_code: "TM03", stated_quantity: 10 }),
          line({ rate_code: "EX01", stated_quantity: 40 }),
        ],
      }),
      rates,
      company,
      "",
    );
    expect(q.exclusions.map((e) => e.reason)).toEqual(["not_offered", "no_price"]);
    expect(q.lines[0].rate_code).toBe("EX01");
  });

  it("drops unknown codes", () => {
    const q = buildQuote(draft({ lines: [line({ rate_code: "ZZ99" }), line({ stated_quantity: 50 })] }), rates, company, "");
    expect(q.lines).toHaveLength(1);
    expect(q.flags.some((f) => f.message.includes("ZZ99"))).toBe(true);
  });

  it("forces a site visit over the area limit and withholds prices", () => {
    const q = buildQuote(draft({ lines: [line({ rate_code: "TM01", stated_quantity: 1200 })] }), rates, company, "");
    expect(q.outcome).toBe("needs_site_visit");
    expect(q.lines).toEqual([]);
    expect(q.total).toBe(0);
  });

  it("never prices a needs_site_visit outcome", () => {
    const q = buildQuote(draft({ outcome: "needs_site_visit", lines: [line({ stated_quantity: 20 })] }), rates, company, "");
    expect(q.lines).toEqual([]);
  });

  it("flags embedded instructions even if the model doesn't report them", () => {
    const enquiry = readFileSync(path.join(__dirname, "..", "brief", "enquiries", "3-kestrel-row-patio.txt"), "utf8");
    expect(detectInjection(enquiry).length).toBeGreaterThan(0);
    const q = buildQuote(draft({ lines: [line({ stated_quantity: 50 })] }), rates, company, enquiry);
    expect(q.flags.some((f) => f.level === "danger")).toBe(true);
    expect(q.lines[0].unit_rate).toBe(14.5);
  });
});

describe("priceLines after human edits", () => {
  it("recomputes totals and the minimum line from scratch", () => {
    const first = buildQuote(draft({ lines: [line({ stated_quantity: 10 })] }), rates, company, "");
    const edited = first.lines.map((l) => (l.rate_code === "EX01" ? { ...l, qty: 40, source: "human" as const } : l));
    const r = priceLines(edited, company);
    expect(r.lines.some((l) => l.rate_code === "MIN")).toBe(false);
    expect(r.subtotal).toBe(580);
  });
});

describe("customer matching", () => {
  const customers = dedupeCustomers(readFileSync(path.join(__dirname, "..", "brief", "03-customers.csv"), "utf8")).map((c, i) => ({
    ...c,
    id: String(i),
  }));
  const enquiry = (f: string) => readFileSync(path.join(__dirname, "..", "brief", "enquiries", f), "utf8");

  it("matches Mrs Okafor via her second email", () => {
    const [m] = matchCustomer(enquiry("1-okafor-driveway.txt"), customers);
    expect(m.name).toBe("Patience Okafor");
    expect(m.confidence).toBe("high");
  });
  it("matches Greenway and Kestrel Row", () => {
    expect(matchCustomer(enquiry("2-greenway-car-park.txt"), customers)[0].name).toBe("Greenway Care Homes");
    expect(matchCustomer(enquiry("3-kestrel-row-patio.txt"), customers)[0].name).toBe("Marcus Hale");
  });
  it("does not match Linda Price on the word 'price'", () => {
    const names = matchCustomer(enquiry("2-greenway-car-park.txt"), customers).map((m) => m.name);
    expect(names).not.toContain("Linda Price");
  });
});

describe("price list narrowing", () => {
  const many = Array.from({ length: 200 }, (_, i) => ({
    code: `A${i}`, item: "x", unit: "m2" as const, rate_ex_vat: 1, status: "active" as const, notes: null, modifiers: [],
    category: i < 100 ? "Fencing" : "Decking",
  }));
  const extra = { code: "N1", item: "Dropped kerb", unit: "each" as const, rate_ex_vat: null, status: "not_offered" as const, notes: null, modifiers: [], category: "Kerbs" };

  it("only narrows big price lists", async () => {
    const { needsNarrowing } = await import("@/lib/quote/catalog");
    expect(needsNarrowing(many.slice(0, 50))).toBe(false);
    expect(needsNarrowing(many)).toBe(true);
  });
  it("keeps picked categories plus anything not offered or unpriced", async () => {
    const { narrowRates } = await import("@/lib/quote/catalog");
    const out = narrowRates([...many, extra], ["Fencing"]);
    expect(out.filter((r) => r.category === "Decking")).toHaveLength(0);
    expect(out.filter((r) => r.category === "Fencing")).toHaveLength(100);
    expect(out).toContain(extra);
  });
  it("falls back to everything if nothing was picked", async () => {
    const { narrowRates } = await import("@/lib/quote/catalog");
    expect(narrowRates(many, [])).toHaveLength(200);
  });
});
