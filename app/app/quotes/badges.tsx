const OUTCOMES: Record<string, [string, string]> = {
  quote: ["Draft priced", "bg-sky-50 text-sky-800"],
  needs_site_visit: ["Needs site visit", "bg-amber-50 text-amber-800"],
  cannot_quote: ["Can't price", "bg-red-50 text-red-800"],
};
const STATUSES: Record<string, [string, string]> = {
  draft: ["Awaiting review", "bg-stone-100 text-stone-700"],
  approved: ["Approved", "bg-emerald-50 text-emerald-800"],
  rejected: ["Rejected", "bg-red-50 text-red-700"],
};

export function OutcomeBadge({ outcome }: { outcome: string }) {
  const [label, cls] = OUTCOMES[outcome] ?? [outcome, ""];
  return <span className={`whitespace-nowrap rounded px-2 py-0.5 text-xs ${cls}`}>{label}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  const [label, cls] = STATUSES[status] ?? [status, ""];
  return <span className={`whitespace-nowrap rounded px-2 py-0.5 text-xs ${cls}`}>{label}</span>;
}
