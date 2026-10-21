// CSV writing with protection against spreadsheet formula injection: a cell
// starting with = + - @ (or a tab/CR) would run as a formula in Excel, so it
// gets a leading apostrophe. Quotes, commas and newlines are quoted per RFC 4180.

const FORMULA = /^[=+\-@\t\r]/;

export function csvCell(value: unknown): string {
  if (value == null) return "";
  let s = Array.isArray(value) ? value.join("; ") : String(value);
  if (FORMULA.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  // BOM so Excel opens UTF-8 (£, ²) correctly.
  return "﻿" + [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function csvResponse(filename: string, body: string): Response {
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename.replace(/[^\w.-]/g, "_")}"`,
      "Cache-Control": "no-store",
    },
  });
}
