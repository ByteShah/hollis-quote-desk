"use client";

import { useState, useTransition } from "react";
import { Check, ChevronDown, Info, ShieldAlert, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import type { Flag } from "@/lib/quote/build";
import { cn } from "@/components/ui";
import { setCheckDone } from "../actions";

/**
 * "Check before approving": each note can be ticked off once a person has
 * looked at it. Ticked notes fold away; when everything is ticked the card
 * shrinks to one line. The page hides it entirely once the quote is approved.
 */
export function Checks({ quoteId, flags, initialChecked }: { quoteId: string; flags: Flag[]; initialChecked: string[] }) {
  const [checked, setChecked] = useState(() => new Set(initialChecked));
  const [showDone, setShowDone] = useState(false);
  const [, start] = useTransition();

  const order = { danger: 0, warning: 1, info: 2 } as const;
  const sorted = [...flags].sort((a, b) => order[a.level] - order[b.level]);
  const open = sorted.filter((f) => !checked.has(f.message));
  const done = sorted.filter((f) => checked.has(f.message));

  const toggle = (f: Flag, value: boolean) => {
    const prev = new Set(checked);
    const next = new Set(checked);
    if (value) next.add(f.message);
    else next.delete(f.message);
    setChecked(next); // optimistic
    start(async () => {
      const res = await setCheckDone(quoteId, f.message, value);
      if (res.error) {
        setChecked(prev);
        toast.error(res.error);
      }
    });
  };

  if (!flags.length) return null;

  return (
    <section className="card overflow-hidden" aria-label="Check before approving">
      <header className="flex items-center gap-2 px-4 py-3 text-sm font-semibold">
        {open.length ? <TriangleAlert className="size-4 text-amber-600" aria-hidden /> : <Check className="size-4 text-emerald-600" aria-hidden />}
        {open.length ? "Check before approving" : "All checked"}
        <span className={cn("rounded-full px-2 text-xs font-medium num", open.length ? "bg-amber-100 text-amber-900" : "bg-emerald-50 text-emerald-800")}>
          {open.length ? open.length : done.length}
        </span>
      </header>

      {open.length > 0 && (
        <ul className="divide-y divide-line/70 border-t border-line/70">
          {open.map((f) => (
            <Item key={f.message} flag={f} done={false} onToggle={toggle} />
          ))}
        </ul>
      )}

      {done.length > 0 && (
        <div className="border-t border-line/70">
          <button
            type="button"
            onClick={() => setShowDone((v) => !v)}
            className="flex w-full items-center gap-1.5 px-4 py-2 text-xs text-muted hover:text-ink"
            aria-expanded={showDone}
          >
            <ChevronDown className={cn("size-3.5 transition", showDone && "rotate-180")} aria-hidden />
            {done.length} checked
          </button>
          {showDone && (
            <ul className="divide-y divide-line/70 border-t border-line/70 bg-sunken/40">
              {done.map((f) => (
                <Item key={f.message} flag={f} done onToggle={toggle} />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function Item({ flag, done, onToggle }: { flag: Flag; done: boolean; onToggle: (f: Flag, value: boolean) => void }) {
  const [expanded, setExpanded] = useState(false);
  const code = flag.message.match(/^([A-Z][A-Z0-9_-]{1,19}):\s*/);
  const text = code ? flag.message.slice(code[0].length) : flag.message;
  const Icon = flag.level === "danger" ? ShieldAlert : flag.level === "warning" ? TriangleAlert : Info;
  return (
    <li className={cn("flex items-start gap-2.5 px-4 py-2.5 text-[13px] leading-snug", flag.level === "danger" && !done && "bg-red-50/70")}>
      <Icon
        className={cn("mt-0.5 size-4 shrink-0", flag.level === "danger" ? "text-red-600" : flag.level === "warning" ? "text-amber-600" : "text-muted")}
        aria-hidden
      />
      {/* Long notes show three lines; click to read the rest. */}
      <span
        onClick={() => setExpanded((v) => !v)}
        title={expanded ? undefined : "Click to read it all"}
        className={cn("min-w-0 flex-1 cursor-pointer text-ink-2", !expanded && "line-clamp-3", done && "text-muted line-through decoration-line-strong")}
      >
        {flag.level === "danger" && <strong className="font-semibold text-red-900">Security: </strong>}
        {code && <span className="mr-1 font-mono text-xs font-medium text-ink">{code[1]}</span>}
        {text}
      </span>
      <button
        type="button"
        onClick={() => onToggle(flag, !done)}
        className={cn(
          "shrink-0 rounded-md px-2 py-1 text-xs font-medium ring-1 transition",
          done ? "text-muted ring-line hover:text-ink" : "bg-surface text-ink ring-line-strong hover:bg-sunken",
        )}
        aria-label={done ? "Mark as not checked" : "Mark as checked"}
      >
        {done ? "Undo" : flag.level === "danger" ? "Seen it" : "Done"}
      </button>
    </li>
  );
}
