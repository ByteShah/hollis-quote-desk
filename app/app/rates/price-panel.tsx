"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, CalendarClock, CheckCheck, Clock3, Loader2, PoundSterling } from "lucide-react";
import { toast } from "sonner";
import { formatGBP } from "@/lib/quote/money";
import { ukToday, unitLabel } from "@/lib/rates";
import { Button, cn } from "@/components/ui";
import { Dialog } from "@/components/dialog";
import { changePrice, markReviewed, setArchived } from "./actions";

const longDate = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export function PricePanel({
  id,
  unit,
  price,
  priceSince,
  nextPrice,
  nextPriceFrom,
  lastReviewed,
  needsReview,
  reviewMonths,
  archived,
  editable,
}: {
  id: string;
  unit: string;
  price: number | null;
  priceSince: string | null;
  nextPrice: number | null;
  nextPriceFrom: string | null;
  lastReviewed: string | null;
  needsReview: boolean;
  reviewMonths: number;
  archived: boolean;
  editable: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  const review = () =>
    start(async () => {
      const res = await markReviewed([id]);
      if (!res.ok) return void toast.error(res.error);
      toast.success("Marked as reviewed");
      router.refresh();
    });

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-start gap-4">
        <div>
          <div className="text-[13px] text-muted">Current price (ex VAT)</div>
          <div className="mt-0.5 text-3xl font-semibold tracking-tight num">
            {price == null ? <span className="text-muted">Not set</span> : formatGBP(price)}
            {price != null && <span className="ml-1 text-base font-normal text-muted">/{unitLabel(unit)}</span>}
          </div>
          {priceSince && <div className="mt-0.5 text-xs text-muted">Since {longDate(priceSince)}</div>}
        </div>
        {editable && !archived && (
          <div className="ml-auto flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={review} disabled={pending || price == null}>
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCheck className="size-3.5" />} Mark reviewed
            </Button>
            <Button size="sm" onClick={() => setOpen(true)}>
              <PoundSterling className="size-3.5" /> Change price
            </Button>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-[13px]">
        {nextPrice != null && nextPriceFrom && (
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-sky-50 px-2.5 py-1 text-sky-800 ring-1 ring-sky-200">
            <CalendarClock className="size-3.5" /> Changes to {formatGBP(nextPrice)} on {longDate(nextPriceFrom)}
          </span>
        )}
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 ring-1",
            needsReview ? "bg-amber-50 text-amber-900 ring-amber-200" : "bg-sunken text-ink-2 ring-line",
          )}
        >
          <Clock3 className="size-3.5" />
          {lastReviewed ? `Last reviewed ${longDate(lastReviewed)}` : "Never reviewed"}
          {needsReview && ` · over ${reviewMonths} months ago`}
        </span>
      </div>

      {open && <PriceDialog id={id} unit={unit} current={price} onClose={() => setOpen(false)} />}
    </div>
  );
}

function PriceDialog({ id, unit, current, onClose }: { id: string; unit: string; current: number | null; onClose: () => void }) {
  const today = ukToday();
  const [price, setPrice] = useState(current == null ? "" : String(current));
  const [from, setFrom] = useState(today);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const pct = current && price ? ((Number(price) - current) / current) * 100 : null;

  return (
    <Dialog
      title="Change price"
      description="The old price stays in the history. Quotes already drafted keep the price they were made with."
      onClose={() => !pending && onClose()}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const res = await changePrice(id, { price, effective_from: from, reason });
            if (!res.ok) return void toast.error(res.error);
            toast.success(from > today ? `New price scheduled for ${longDate(from)}` : "Price updated");
            onClose();
            router.refresh();
          });
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="new-price">New price ex VAT</label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-2.5 text-sm text-muted">£</span>
              <input id="new-price" className="input pl-7 num" type="number" min="0" step="0.01" inputMode="decimal" required autoFocus value={price} onChange={(e) => setPrice(e.target.value)} />
              <span className="pointer-events-none absolute right-3 top-2.5 text-[13px] text-muted">/{unitLabel(unit)}</span>
            </div>
            {pct != null && Number.isFinite(pct) && pct !== 0 && (
              <p className={cn("mt-1 text-xs num", pct > 0 ? "text-emerald-700" : "text-amber-700")}>
                {pct > 0 ? "+" : ""}
                {pct.toFixed(1)}% on {formatGBP(current!)}
              </p>
            )}
          </div>
          <div>
            <label className="label" htmlFor="effective">Starts on</label>
            <input id="effective" className="input" type="date" required value={from} onChange={(e) => setFrom(e.target.value)} />
            {from > today && <p className="mt-1 text-xs text-sky-700">Scheduled. The current price stays until then.</p>}
          </div>
        </div>
        <div>
          <label className="label" htmlFor="reason">Reason</label>
          <input id="reason" className="input" required minLength={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Supplier price rise, March 2027" />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />} Save price
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function ArchiveButton({ id, version, archived, code }: { id: string; version: number; archived: boolean; code: string }) {
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = () =>
    start(async () => {
      const res = await setArchived(id, version, !archived);
      if (!res.ok) return void toast.error(res.error);
      toast.success(archived ? `${code} restored` : `${code} archived`);
      setConfirm(false);
      router.refresh();
    });

  if (archived) {
    return (
      <Button variant="secondary" onClick={run} disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <ArchiveRestore className="size-4" />} Restore
      </Button>
    );
  }
  return (
    <>
      <Button variant="secondary" onClick={() => setConfirm(true)}>
        <Archive className="size-4" /> Archive
      </Button>
      {confirm && (
        <Dialog
          title={`Archive ${code}?`}
          description="It disappears from new quotes and the price list. Existing quotes keep it, and you can restore it any time."
          onClose={() => !pending && setConfirm(false)}
        >
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirm(false)} disabled={pending}>Cancel</Button>
            <Button variant="danger" onClick={run} disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Archive className="size-4" />} Archive
            </Button>
          </div>
        </Dialog>
      )}
    </>
  );
}
