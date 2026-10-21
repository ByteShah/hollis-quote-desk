import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime } from "@/lib/dates";

// Run under a US timezone to prove output doesn't depend on where the code runs.
process.env.TZ = "America/Los_Angeles";

describe("UK dates", () => {
  it("shows timestamps in UK time, including BST", () => {
    expect(formatDateTime("2026-10-21T19:52:00Z")).toBe("21 Oct 2026, 20:52");
    expect(formatDateTime("2026-12-01T09:00:00Z")).toBe("1 Dec 2026, 09:00");
  });
  it("never shifts a calendar date", () => {
    expect(formatDate("2027-03-01")).toBe("1 Mar 2027");
    expect(formatDate("2027-03-01", "numeric")).toBe("01/03/2027");
  });
  it("gives the UK date for a late-evening UTC timestamp", () => {
    expect(formatDate("2026-10-21T23:30:00Z")).toBe("22 Oct 2026");
  });
});
