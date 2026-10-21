import type { RateDecision } from "./rates";

// Judgement calls on Shaz's rate sheet that the generic cleaner can't make.
// Each one is written down so Dave/Shaz can overrule it. Where a call has to
// be made between two prices, we take the higher one: under-quoting is the
// failure Dave told us he can't afford.

export const HOLLIS_RATE_DECISIONS: Record<string, RateDecision> = {
  SB02: { status: "archived", reason: "Duplicate of SB03 (Type 1 per tonne). SB03 is the 'new price from March'." },
  SB03: { status: "active", reason: "Current Type 1 per-tonne price (March increase)." },
  KB02: {
    status: "archived",
    reason: "Same item as KB01 with a vaguer description and lower price; KB01 (£28/m) kept so we don't under-quote.",
  },
  EX06: { status: "archived", reason: "Note says 'old - use per load'; EX05 per-load is used instead." },
  BP01: {
    modifiers: [{ id: "herringbone", label: "herringbone pattern", amount: 4, per: "unit" }],
    reason: "Herringbone (+£4/m²) turned into a selectable modifier.",
  },
  BP04: {
    status: "archived",
    reason: "Note '?? usually included in BP01'. Excluded from auto-quotes so it isn't double-charged; ask Shaz.",
  },
  PL01: {
    modifiers: [{ id: "road_permit", label: "Skip permit for placing on the road", amount: 60, per: "flat" }],
    reason: "'needs permit if on road, +£60' turned into a selectable modifier.",
  },
  CO02: {
    status: "price_on_request",
    rate_ex_vat: null,
    reason: "£1,250 is labelled per m³ but the note says it's probably per load. Not used until Dave confirms.",
  },
  TM03: { status: "price_on_request", reason: "Resin price changes; 'ask Dave'." },
  KB04: { status: "not_offered", reason: "Dropped kerbs need a council-approved contractor; refer to the council." },
  MI01: {
    status: "archived",
    reason: "The £450 minimum is applied automatically by the app as a top-up line, so it's never offered to the AI as an item (that would double-charge).",
  },
};
