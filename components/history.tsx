import { getTenant } from "@/lib/tenant";
import { formatGBP } from "@/lib/quote/money";
import { cn } from "./ui";
import { NoteForm } from "./note-form";
import { formatDate, formatDateTime } from "@/lib/dates";

// Record history (the "chatter"): every change written by the database
// triggers, plus notes people add. Rendered on the server and streamed in.

type Entry = {
  id: number;
  action: string;
  at: string;
  user_id: string | null;
  user_email: string | null;
  detail: Record<string, unknown>;
  note: string | null;
};

const FIELD: Record<string, string> = {
  item: "Name",
  unit: "Unit",
  category: "Category",
  status: "Status",
  notes: "Notes",
  modifiers: "Extras",
  name: "Name",
  company_name: "Company",
  emails: "Emails",
  phones: "Phones",
  address: "Address",
  postcode: "Postcode",
  invoice_email: "Invoice email",
  payment_terms: "Payment terms",
  tags: "Tags",
  archived_at: "Archived",
  last_reviewed_at: "Last reviewed",
  customer_id: "Customer",
};

const STATUS: Record<string, string> = {
  active: "In use",
  archived: "Archived",
  price_on_request: "No price",
  not_offered: "Not offered",
};

function show(v: unknown): string {
  if (v == null || v === "") return "empty";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "none";
  if (typeof v === "string" && STATUS[v]) return STATUS[v];
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) return formatDate(v, "numeric");
  if (typeof v === "object") return "updated";
  return String(v);
}

function describe(e: Entry): { title: string; lines: string[] } {
  const d = e.detail ?? {};
  const changes = (d.changes ?? {}) as Record<string, { from: unknown; to: unknown }>;
  const changeLines = Object.entries(changes)
    .filter(([k]) => FIELD[k] && k !== "archived_at" && k !== "last_reviewed_at")
    .map(([k, c]) => `${FIELD[k]}: ${show(c.from)} → ${show(c.to)}`);
  const [, verb] = e.action.split(".");
  switch (e.action) {
    case "note":
      return { title: "Note", lines: [] };
    case "rate.price_added":
      return {
        title: `Price set to ${formatGBP(Number(d.price))}`,
        lines: [
          `From ${formatDate(String(d.effective_from))}`,
          String(d.reason ?? ""),
        ].filter(Boolean),
      };
    case "rate.price_removed":
      return { title: `Price ${formatGBP(Number(d.price))} removed`, lines: [String(d.reason ?? "")] };
    case "quote.drafted":
      return { title: "Draft created by AI", lines: [] };
    case "quote.edited":
      return { title: "Lines edited", lines: d.total ? [`Total ${show((d.total as { from: unknown }).from)} → ${show((d.total as { to: unknown }).to)}`] : [] };
    case "quote.approved":
      return { title: "Approved", lines: [] };
    case "quote.rejected":
      return { title: "Rejected", lines: [] };
    case "quote.draft":
      return { title: "Reopened", lines: [] };
    case "quote.customer_set":
      return { title: "Customer changed", lines: [] };
    case "import.reverted":
      return { title: "Import undone", lines: [] };
  }
  const titles: Record<string, string> = {
    created: "Created",
    updated: "Updated",
    archived: "Archived",
    restored: "Restored",
    reviewed: "Marked as reviewed",
  };
  return { title: titles[verb] ?? e.action, lines: changeLines };
}

export async function History({ entity, entityId, path, canNote = true }: { entity: "rate" | "customer" | "quote"; entityId: string; path: string; canNote?: boolean }) {
  const { supabase, user } = await getTenant();
  const { data } = await supabase
    .from("audit_log")
    .select("id, action, at, user_id, user_email, detail, note")
    .eq("entity", entity)
    .eq("entity_id", entityId)
    .order("at", { ascending: false })
    .limit(100);
  const entries = (data ?? []) as Entry[];

  return (
    <div className="space-y-4">
      {canNote && <NoteForm entity={entity} entityId={entityId} path={path} />}
      {entries.length === 0 ? (
        <p className="text-sm text-muted">No activity yet.</p>
      ) : (
        <ol className="relative space-y-4 border-l border-line pl-4">
          {entries.map((e) => {
            const { title, lines } = describe(e);
            const who = e.user_id === user.id ? "You" : (e.user_email ?? "System");
            return (
              <li key={e.id} className="relative text-[13px]">
                <span
                  className={cn(
                    "absolute -left-[21px] top-1 size-2.5 rounded-full ring-4 ring-surface",
                    e.action === "note" ? "bg-sky-500" :
                    e.action.endsWith("approved") ? "bg-emerald-500" :
                    e.action.endsWith("rejected") || e.action.endsWith("archived") ? "bg-red-400" :
                    e.action.endsWith("price_added") ? "bg-brand" : "bg-line-strong",
                  )}
                />
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium text-ink">{title}</span>
                  <span className="text-xs text-muted">
                    {who} · {formatDateTime(e.at)}
                  </span>
                </div>
                {e.note && <p className="mt-1 whitespace-pre-wrap rounded-lg bg-sky-50 px-3 py-2 text-ink-2">{e.note}</p>}
                {lines.length > 0 && (
                  <ul className="mt-0.5 space-y-0.5 text-ink-2">
                    {lines.map((l, i) => (
                      <li key={i} className="break-words">{l}</li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
