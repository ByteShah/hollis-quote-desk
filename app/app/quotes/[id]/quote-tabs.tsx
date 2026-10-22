"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/components/ui";

export type QuoteTab = { key: string; label: string; icon: ReactNode; count?: number; content: ReactNode };

/**
 * All panels are rendered on the server once; switching tabs only shows and
 * hides them, so it's instant and unsaved line edits survive a tab switch.
 * The URL keeps the tab (?tab=…) so a refresh or shared link opens it.
 * Printing always prints the customer preview, whichever tab is open.
 */
export function QuoteTabs({ tabs, initial, quoteId }: { tabs: QuoteTab[]; initial: string; quoteId: string }) {
  const [active, setActive] = useState(tabs.some((t) => t.key === initial) ? initial : tabs[0].key);

  const open = (key: string) => {
    setActive(key);
    window.history.replaceState(null, "", key === tabs[0].key ? `/app/quotes/${quoteId}` : `/app/quotes/${quoteId}?tab=${key}`);
  };

  return (
    <div>
      <div className="no-print mb-4 flex max-w-full overflow-x-auto" role="tablist" aria-label="Quote sections">
        <div className="inline-flex rounded-lg bg-sunken p-1 ring-1 ring-line">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              id={`tab-${t.key}`}
              aria-selected={active === t.key}
              aria-controls={`panel-${t.key}`}
              onClick={() => open(t.key)}
              className={cn(
                "flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-[13px] transition",
                active === t.key ? "bg-surface font-medium text-ink shadow-(--shadow-card)" : "text-muted hover:text-ink",
              )}
            >
              {t.icon} {t.label}
              {!!t.count && <span className="rounded-full bg-line px-1.5 text-[11px] text-ink-2 num">{t.count}</span>}
            </button>
          ))}
        </div>
      </div>
      {tabs.map((t) => (
        <div
          key={t.key}
          id={`panel-${t.key}`}
          role="tabpanel"
          aria-labelledby={`tab-${t.key}`}
          className={cn(
            active === t.key ? "animate-rise" : "hidden",
            t.key === "preview" ? "print:block" : "no-print",
          )}
        >
          {t.content}
        </div>
      ))}
    </div>
  );
}
