import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseRatesCsv, parsePrice } from "@/lib/import/rates";
import { HOLLIS_RATE_DECISIONS } from "@/lib/import/hollis-decisions";
import { dedupeCustomers } from "@/lib/import/customers";

const brief = (f: string) => readFileSync(path.join(__dirname, "..", "brief", f), "utf8");

describe("rates import", () => {
  const rates = parseRatesCsv(brief("02-rates.csv"), { vatRate: 0.2, decisions: HOLLIS_RATE_DECISIONS });
  const get = (c: string) => rates.find((r) => r.code === c)!;

  it("parses every row, BOM included", () => {
    expect(rates).toHaveLength(40);
    expect(rates[0].code).toBe("EX01");
  });

  it("normalises units", () => {
    expect(get("EX03").unit).toBe("m2");
    expect(get("EX04").unit).toBe("m2");
    expect(get("KB01").unit).toBe("m");
    expect(get("MI01").unit).toBe("job");
  });

  it("strips VAT from prices entered with VAT", () => {
    expect(get("PT01").rate_ex_vat).toBe(70.83);
  });

  it("does not use doubtful or unpriced rows", () => {
    expect(get("CO02").status).toBe("price_on_request");
    expect(get("TM03").status).toBe("price_on_request");
    expect(get("TM03").rate_ex_vat).toBeNull();
    expect(get("KB04").status).toBe("not_offered");
  });

  it("supersedes old and duplicate prices", () => {
    for (const c of ["BP02", "SB02", "KB02", "EX06", "BP04"]) expect(get(c).status).toBe("superseded");
    for (const c of ["BP01", "SB03", "KB01", "EX05"]) expect(get(c).status).toBe("active");
  });

  it("parses formatted prices", () => {
    expect(parsePrice("£1,250")).toBe(1250);
    expect(parsePrice("TBC")).toBeNull();
    expect(parsePrice("14.50")).toBe(14.5);
  });
});

describe("customer dedupe", () => {
  const customers = dedupeCustomers(brief("03-customers.csv"));
  const find = (s: string) => customers.filter((c) => c.name.includes(s) || c.company_name?.includes(s));

  it("merges the obvious duplicates and nothing else", () => {
    expect(customers).toHaveLength(9);
    for (const s of ["Okafor", "Hale", "Sandhu", "Doyle"]) expect(find(s)).toHaveLength(1);
  });

  it("keeps both Okafor emails on one record", () => {
    const [o] = find("Okafor");
    expect(o.name).toBe("Patience Okafor");
    expect(o.emails).toEqual(expect.arrayContaining(["p.okafor@example.com", "patience.okafor64@example.com"]));
  });

  it("captures Kestrel Row invoice address and terms", () => {
    const [k] = find("Hale");
    expect(k.invoice_email).toBe("accounts@kestrelrow.example");
    expect(k.payment_terms).toBe("30 days");
  });
});
