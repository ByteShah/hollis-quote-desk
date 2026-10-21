import { Badge, type Tone } from "./ui";

const OUTCOMES: Record<string, [string, Tone]> = {
  quote: ["Priced draft", "info"],
  needs_site_visit: ["Site visit needed", "warning"],
  cannot_quote: ["Can't price", "danger"],
};
const STATUSES: Record<string, [string, Tone]> = {
  draft: ["Awaiting review", "neutral"],
  approved: ["Approved", "success"],
  rejected: ["Rejected", "danger"],
};
const RATE_STATUSES: Record<string, [string, Tone]> = {
  active: ["In use", "success"],
  superseded: ["Superseded", "neutral"],
  price_on_request: ["No price", "warning"],
  not_offered: ["Not offered", "danger"],
};

export function OutcomeBadge({ outcome }: { outcome: string }) {
  const [label, tone] = OUTCOMES[outcome] ?? [outcome, "neutral"];
  return <Badge tone={tone}>{label}</Badge>;
}

export function StatusBadge({ status }: { status: string }) {
  const [label, tone] = STATUSES[status] ?? [status, "neutral"];
  return (
    <Badge tone={tone} dot>
      {label}
    </Badge>
  );
}

export function RateStatusBadge({ status }: { status: string }) {
  const [label, tone] = RATE_STATUSES[status] ?? [status, "neutral"];
  return <Badge tone={tone}>{label}</Badge>;
}

export function Logo({ className = "size-7" }: { className?: string }) {
  // Three ground strata: surface, sub-base, formation.
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="8" fill="var(--color-brand)" />
      <path d="M7 11.5h18" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M7 16.5h13" stroke="#fff" strokeOpacity=".7" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M7 21.5h8" stroke="#fff" strokeOpacity=".45" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

export function timeAgo(iso: string): string {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d} d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
