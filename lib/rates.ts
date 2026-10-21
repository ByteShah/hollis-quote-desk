// Shared price-list helpers (safe on client and server).

export const UNIT_OPTIONS = [
  { value: "m2", label: "m² (square metre)" },
  { value: "m", label: "m (linear metre)" },
  { value: "m3", label: "m³ (cubic metre)" },
  { value: "each", label: "each" },
  { value: "job", label: "job" },
  { value: "day", label: "day" },
  { value: "load", label: "load" },
  { value: "tonne", label: "tonne" },
] as const;

export const unitLabel = (u: string) => (u === "m2" ? "m²" : u === "m3" ? "m³" : u);

/** The date before which a price counts as not reviewed. */
export function reviewCutoff(months: number, now = new Date()): Date {
  const d = new Date(now);
  d.setMonth(d.getMonth() - months);
  return d;
}

export function needsReview(
  r: { status: string; last_reviewed_at: string | null; price_since: string | null },
  months: number,
  now = new Date(),
): boolean {
  if (r.status !== "active") return false;
  const cutoff = reviewCutoff(months, now).getTime();
  const seen = [r.last_reviewed_at, r.price_since].filter(Boolean).map((d) => new Date(d!).getTime());
  return seen.length === 0 || Math.max(...seen) < cutoff;
}

/** Today's date in the UK (YYYY-MM-DD), matching the database's business_date(). */
export function ukToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
