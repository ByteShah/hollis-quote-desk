// All money is handled in integer pence so totals never drift.

export const toPence = (pounds: number): number => Math.round(pounds * 100);
export const toPounds = (pence: number): number => pence / 100;

export function lineTotalPence(unitRatePence: number, qty: number): number {
  return Math.round(unitRatePence * qty);
}

export function vatPence(subtotalPence: number, vatRate: number): number {
  return Math.round(subtotalPence * vatRate);
}

export const formatGBP = (pounds: number): string =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pounds);
