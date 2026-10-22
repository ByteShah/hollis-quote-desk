// Structured server logs: one JSON object per line, so Vercel's log search can
// filter on any field (e.g. `event:quote.draft.built outcome:needs_site_visit`).
//
// Never log enquiry text, customer names or contact details, AI output text,
// or keys. Log ids, counts, codes, timings and our own error messages.

type Fields = Record<string, string | number | boolean | null | undefined | string[] | Record<string, number>>;

function write(level: "info" | "warn" | "error", event: string, fields: Fields) {
  const line = JSON.stringify({ level, event, ts: new Date().toISOString(), ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  info: (event: string, fields: Fields = {}) => write("info", event, fields),
  warn: (event: string, fields: Fields = {}) => write("warn", event, fields),
  error: (event: string, fields: Fields = {}) => write("error", event, fields),
};

/** Milliseconds since `start`, for timing a step. */
export const since = (start: number) => Math.round(performance.now() - start);
