import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { planCustomers, planRates, readCsv, suggestMapping, summarise, type ExistingCustomer } from "@/lib/import/wizard";
import { csvCell, toCsv } from "@/lib/csv";
import { parseRatesCsv } from "@/lib/import/rates";
import { HOLLIS_RATE_DECISIONS } from "@/lib/import/hollis-decisions";
import { categoryFor } from "@/lib/import/categories";

const brief = (f: string) => readFileSync(path.join(__dirname, "..", "brief", f), "utf8");

describe("rates import", () => {
  const table = readCsv(brief("02-rates.csv"));
  const mapping = suggestMapping("rates", table.headers);

  it("matches Shaz's columns automatically", () => {
    expect(table.headers).toEqual(["Code", "Item", "Unit", "Rate", "Notes"]);
    expect(mapping).toMatchObject({ code: 0, item: 1, unit: 2, price: 3, notes: 4, category: null, status: null });
  });

  it("imports every row of the original sheet into an empty company", () => {
    const plan = planRates(table, mapping, [], 0.2);
    expect(summarise(plan.preview)).toMatchObject({ create: 40, error: 0 });
    const get = (c: string) => plan.items.find((i) => i.code === c)!;
    expect(get("PT01").price).toBe(70.83);
    expect(get("KB04").status).toBe("not_offered");
    expect(get("TM03").status).toBe("price_on_request");
    expect(get("BP02").status).toBe("archived");
    expect(get("CO02").price).toBe(1250);
    expect(get("EX03").unit).toBe("m2");
    expect(get("BP01").category).toBe("Block paving");
  });

  it("reaches the same decisions as the hand-checked Hollis import, on its own", () => {
    const plan = planRates(table, mapping, [], 0.2);
    const seeded = parseRatesCsv(brief("02-rates.csv"), { vatRate: 0.2, decisions: HOLLIS_RATE_DECISIONS });
    for (const s of seeded) {
      const got = plan.items.find((i) => i.code === s.code)!;
      if (s.code === "CO02") continue; // only an answer can settle it; see the next test
      expect({ code: s.code, status: got.status, visit: !!got.site_visit_reason }).toEqual({
        code: s.code,
        status: s.status,
        visit: !!s.site_visit_reason,
      });
    }
    // Unanswered, the doubtful concrete price is held back rather than guessed.
    expect(plan.items.find((i) => i.code === "CO02")!.status).toBe("price_on_request");
    expect(plan.items.find((i) => i.code === "BP04")!.included_in).toEqual(["BP01"]);
    const bp01 = plan.items.find((i) => i.code === "BP01")!;
    expect(bp01.modifiers).toEqual([{ id: "herringbone", label: "Herringbone", amount: 4, per: "unit" }]);
    const pl01 = plan.items.find((i) => i.code === "PL01")!;
    expect(pl01.modifiers).toMatchObject([{ amount: 60, per: "flat" }]);
    expect(pl01.modifiers[0].label).toMatch(/permit/i);
    const kb02 = plan.preview.find((p) => p.key === "KB02")!;
    expect(kb02.warnings.join(" ")).toMatch(/duplicate of KB01/);
  });

  it("asks what the file can't say, and with Dave's answers matches the confirmed setup exactly", () => {
    const unanswered = planRates(table, mapping, [], 0.2);
    expect(unanswered.questions.map((q) => q.id)).toEqual(["load:CO02", "incl:BP04"]);
    const incl = unanswered.questions.find((q) => q.kind === "also_included_in")!;
    expect(incl.kind === "also_included_in" && incl.options.map((o) => o.code)).toEqual(["BP03"]);

    const plan = planRates(table, mapping, [], 0.2, { "load:CO02": 6, "incl:BP04": ["BP03"] });
    const seeded = parseRatesCsv(brief("02-rates.csv"), { vatRate: 0.2, decisions: HOLLIS_RATE_DECISIONS });
    for (const s of seeded) {
      const got = plan.items.find((i) => i.code === s.code)!;
      expect({
        code: got.code,
        status: got.status,
        unit: got.unit,
        price: got.price,
        load_size: got.load_size ?? null,
        included_in: got.included_in,
        visit: !!got.site_visit_reason,
      }).toEqual({
        code: s.code,
        status: s.status,
        unit: s.unit,
        price: s.rate_ex_vat,
        load_size: s.load_size ?? null,
        included_in: s.included_in ?? [],
        visit: !!s.site_visit_reason,
      });
    }
    expect(plan.items.find((i) => i.code === "CO02")!.import_notes).toMatch(/Answered at import: priced per load of 6/);
  });

  it("ignores answers to questions it didn't ask", () => {
    const plan = planRates(table, mapping, [], 0.2, { "load:EX01": 3, "incl:BP04": ["EX01", "BP03"] });
    expect(plan.items.find((i) => i.code === "EX01")!.unit).toBe("m2");
    expect(plan.items.find((i) => i.code === "BP04")!.included_in).toEqual(["BP01", "BP03"]);
  });

  it("guesses categories from item names for any company", () => {
    expect(categoryFor("X1", "Close-board fencing 1.8m")).toBe("Fencing");
    expect(categoryFor("A7", "Linear channel drain")).toBe("Drainage");
    expect(categoryFor("Q3", "Granite kerb")).toBe("Kerbs & edging");
    expect(categoryFor("Z9", "Something else")).toBeNull();
  });

  it("only reports real changes against existing items", () => {
    const first = planRates(table, mapping, [], 0.2).items;
    const existing = first.map((i) => ({ code: i.code, item: i.item, unit: i.unit, category: i.category, status: i.status, notes: i.notes, rate_ex_vat: i.price }));
    expect(summarise(planRates(table, mapping, existing, 0.2).preview)).toMatchObject({ unchanged: 40, create: 0, update: 0 });

    const bumped = existing.map((e) => (e.code === "BP01" ? { ...e, rate_ex_vat: 58 } : e));
    const plan = planRates(table, mapping, bumped, 0.2);
    const row = plan.preview.find((p) => p.key === "BP01")!;
    expect(row.action).toBe("update");
    expect(row.changes).toEqual(["Price: £58.00 → £62.00"]);
  });

  it("rejects bad rows with a reason and keeps the rest", () => {
    const bad = readCsv("Code,Item,Unit,Rate\nAA1,Thing,m2,10\nAA1,Again,m2,11\nBB1,Widget,furlong,5\n,No code,m2,1\nCC1,Pricey,m2,ten");
    const plan = planRates(bad, suggestMapping("rates", bad.headers), [], 0.2);
    expect(plan.preview.map((p) => p.action)).toEqual(["create", "error", "error", "error", "error"]);
    expect(plan.preview[1].errors[0]).toMatch(/more than once/);
    expect(plan.preview[2].errors[0]).toMatch(/Unknown unit/);
    expect(plan.preview[4].errors[0]).toMatch(/isn't a number/);
    expect(plan.items).toHaveLength(1);
  });

  it("reads scheduled prices with UK dates", () => {
    const t = readCsv("Code,Item,Unit,Price,Effective from\nAA1,Thing,m2,10,01/03/2030");
    expect(planRates(t, suggestMapping("rates", t.headers), [], 0.2).items[0].effective_from).toBe("2030-03-01");
  });
});

describe("customers import", () => {
  const table = readCsv(brief("03-customers.csv"));
  const mapping = suggestMapping("customers", table.headers);

  it("merges duplicates inside the file", () => {
    const plan = planCustomers(table, mapping, []);
    expect(summarise(plan.preview)).toMatchObject({ create: 9, error: 0 });
    const hale = plan.items.find((i) => i.values.name === "Marcus Hale")!;
    expect(hale.values.invoice_email).toBe("accounts@kestrelrow.example");
  });

  it("re-importing the same file changes nothing", () => {
    const first = planCustomers(table, mapping, []).items;
    const existing = first.map((i, n) => ({ id: String(n), ...i.values }) as ExistingCustomer);
    expect(summarise(planCustomers(table, mapping, existing).preview)).toMatchObject({ unchanged: 9, create: 0, update: 0 });
  });

  it("adds new details to an existing customer without overwriting", () => {
    const existing: ExistingCustomer[] = [
      { id: "1", name: "Linda Price", company_name: null, emails: ["linda.price@example.com"], phones: [], address: "22 Mill Street", postcode: null, notes: null, invoice_email: null, payment_terms: null, tags: [] },
    ];
    const t = readCsv("Name,Email,Phone,Address,Tags\nLinda P,linda.price@example.com,0121 000 1111,Somewhere else,landlord");
    const plan = planCustomers(t, suggestMapping("customers", t.headers), existing);
    expect(plan.items[0]).toMatchObject({ action: "update", id: "1", values: { phones: ["0121 000 1111"], tags: ["landlord"] } });
    expect(plan.items[0].values).not.toHaveProperty("address");
    expect(plan.preview[0].warnings.join(" ")).toMatch(/Kept the existing address/);
  });
});

describe("CSV export safety", () => {
  it("neutralises spreadsheet formulas and quotes properly", () => {
    expect(csvCell("=HYPERLINK(\"http://evil\")")).toBe("\"'=HYPERLINK(\"\"http://evil\"\")\"");
    expect(csvCell("+44 7700")).toBe("'+44 7700");
    expect(csvCell("a,b")).toBe("\"a,b\"");
    expect(toCsv(["A"], [["x"]])).toBe("﻿A\r\nx\r\n");
  });
});
