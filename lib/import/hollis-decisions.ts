import type { RateDecision } from "./rates";

// Judgement calls on Shaz's rate sheet that the generic cleaner can't make.
// Dave and Shaz answered our questions on 2026-10-22; each decision says who
// confirmed it, so the reasoning is visible on the item's page.

export const HOLLIS_RATE_DECISIONS: Record<string, RateDecision> = {
  SB02: { status: "archived", reason: "Old Type 1 price. Shaz: use SB03 at £41/t since the March increase." },
  SB03: { status: "active", reason: "Current Type 1 per-tonne price (confirmed by Shaz)." },
  BP02: { status: "archived", reason: "Old price. Shaz: use BP01 since the March increase." },
  KB02: { status: "archived", reason: "Shaz: KB01 and KB02 are the same edging kerb listed twice. Use KB01 at £28/m." },
  EX06: { status: "archived", reason: "Shaz: muck away is EX05 per load, not EX06 per tonne." },
  BP01: {
    modifiers: [{ id: "herringbone", label: "herringbone pattern", amount: 4, per: "unit" }],
    reason: "Dave: herringbone (+£4/m²) is optional and only added when the customer asks for it.",
  },
  BP04: {
    status: "active",
    included_in: ["BP01", "BP03"],
    reason: "Dave: kiln-dried sand is included in BP01. BP04 is only charged on its own for re-sanding jobs where no new blocks are laid.",
  },
  PL01: {
    modifiers: [{ id: "road_permit", label: "Skip permit for placing on the road", amount: 60, per: "flat" }],
    reason: "Shaz: the £60 permit only applies when the skip goes on the road. If the enquiry doesn't say, it's flagged for the reviewer.",
  },
  CO02: {
    status: "active",
    unit: "load",
    load_size: 6,
    reason: "Dave: £1,250 is per load of about 6 m³, and a part load is charged as a full load.",
  },
  TM02: { site_visit_reason: "The existing base must be sound; Dave needs to look at it first.", reason: "Dave: tarmac overlays are flagged for a look." },
  TM03: { status: "price_on_request", site_visit_reason: "All resin comes to Dave; the supplier price keeps changing.", reason: "Dave: resin is never priced by the tool." },
  DR03: { site_visit_reason: "Depends on a percolation test.", reason: "Dave: soakaways are flagged for a look." },
  KB04: { status: "not_offered", reason: "Dave: we don't do dropped kerbs; the customer should go to the council." },
  PT01: { reason: "Shaz: PT01 is the only price that included VAT (£70.83/m² ex VAT)." },
  MI01: {
    status: "archived",
    reason: "Shaz: the minimum is £450 + VAT. The app applies it automatically as a top-up line, so it's never offered to the AI as an item (that would double-charge).",
  },
};
