import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTenant } from "@/lib/tenant";
import { Badge, Card, PageHeader } from "@/components/ui";
import { UndoImportButton } from "./undo";

export const metadata: Metadata = { title: "Import" };

type Row = { code?: string; name?: string; action: string; record_id: string; price_version_id?: string | null };

export default async function ImportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, can } = await getTenant();
  if (!can("data.import")) redirect("/app/quotes");
  const { data: b } = await supabase.from("import_batches").select("*").eq("id", id).maybeSingle();
  if (!b) notFound();

  const rows = b.rows as Row[];
  const s = b.summary as { create?: number; update?: number; unchanged?: number; error?: number };
  const revert = b.revert_summary as { restored: number; removed: number; archived: number; skipped: { label: string; reason: string }[] } | null;
  const base = b.kind === "rates" ? "/app/rates" : "/app/customers";

  return (
    <div className="animate-rise">
      <PageHeader
        eyebrow={<Link href="/app/imports" className="hover:text-ink">Import history</Link>}
        title={b.filename}
        description={`${b.kind === "rates" ? "Price list" : "Customer"} import by ${b.created_by_email ?? "unknown"} on ${new Date(b.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}.`}
        actions={b.status === "applied" && <UndoImportButton id={b.id} />}
      />
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["New", s.create ?? 0, "success"],
          ["Updated", s.update ?? 0, "info"],
          ["Unchanged", s.unchanged ?? 0, "neutral"],
          ["Skipped (errors)", s.error ?? 0, "danger"],
        ].map(([label, n, tone]) => (
          <div key={label as string} className="card px-4 py-3">
            <div className="text-[13px] text-muted">{label}</div>
            <div className="mt-1 text-xl font-semibold num">{n as number}</div>
            <span className="sr-only">{tone}</span>
          </div>
        ))}
      </div>

      {b.status === "reverted" && revert && (
        <div className="mb-5 rounded-xl border border-line bg-sunken px-4 py-3 text-sm text-ink-2">
          <strong className="font-medium text-ink">Undone {new Date(b.reverted_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}.</strong>{" "}
          {revert.restored} restored, {revert.removed} removed, {revert.archived} archived (already used on quotes).
          {revert.skipped.length > 0 && (
            <div className="mt-2 text-amber-900">
              Left as they are because they were edited after the import: {revert.skipped.map((x) => x.label).join(", ")}.
            </div>
          )}
        </div>
      )}

      <Card title="What this import changed" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px]">
            <thead>
              <tr>
                <th className="th">{b.kind === "rates" ? "Item" : "Customer"}</th>
                <th className="th">Change</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.record_id + r.action}>
                  <td className="td">
                    {b.status === "applied" ? (
                      <Link href={`${base}/${r.record_id}`} className="font-medium hover:underline">{r.code ?? r.name}</Link>
                    ) : (
                      <span className="font-medium">{r.code ?? r.name}</span>
                    )}
                  </td>
                  <td className="td">
                    <Badge tone={r.action === "create" ? "success" : "info"}>{r.action === "create" ? "Added" : "Updated"}</Badge>
                    {r.price_version_id && <Badge tone="brand" className="ml-1.5">New price</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
