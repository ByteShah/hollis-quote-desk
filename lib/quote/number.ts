/** Q-0001: the number people quote on the phone. Assigned per company by the database. */
export function quoteRef(number: number | null | undefined): string {
  return number ? `Q-${String(number).padStart(4, "0")}` : "Q-····";
}
