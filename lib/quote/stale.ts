/** Lines priced from rates nobody has reviewed within the company's review period. */
export function stalePriceFlags(
  lines: { rate_code: string | null }[],
  rates: { code: string; price_since: string | null; last_reviewed_at: string | null }[],
  months: number,
  now = new Date(),
) {
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - months);
  const byCode = new Map(rates.map((r) => [r.code, r]));
  const stale = [...new Set(lines.map((l) => l.rate_code).filter((c): c is string => !!c))].filter((code) => {
    const r = byCode.get(code);
    if (!r) return false;
    const seen = [r.last_reviewed_at, r.price_since].filter(Boolean).map((d) => new Date(d!).getTime());
    return seen.length > 0 && Math.max(...seen) < cutoff.getTime();
  });
  return stale.length
    ? [{ level: "warning" as const, message: `Prices for ${stale.join(", ")} haven't been reviewed in over ${months} months. Check them before approving.` }]
    : [];
}
