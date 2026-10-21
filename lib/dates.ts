// Dates are shown in UK time for everyone, whatever timezone the server
// (Vercel runs in UTC) or the browser is in. Plain dates like a price's
// "from" date (YYYY-MM-DD) are calendar dates and must never shift a day.

const TZ = "Europe/London";

const STYLES = {
  short: { day: "numeric", month: "short" },
  dayMonth: { day: "numeric", month: "long" },
  medium: { day: "numeric", month: "short", year: "numeric" },
  long: { day: "numeric", month: "long", year: "numeric" },
  numeric: { day: "2-digit", month: "2-digit", year: "numeric" },
} as const satisfies Record<string, Intl.DateTimeFormatOptions>;

const isCalendarDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export function formatDate(value: string | Date, style: keyof typeof STYLES = "medium"): string {
  const calendar = isCalendarDate(value);
  const d = calendar ? new Date(`${value}T00:00:00Z`) : new Date(value);
  return new Intl.DateTimeFormat("en-GB", { ...STYLES[style], timeZone: calendar ? "UTC" : TZ }).format(d);
}

export function formatDateTime(value: string | Date): string {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: TZ }).format(new Date(value));
}
