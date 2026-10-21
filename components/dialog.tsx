"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "./ui";

/** Native <dialog> modal: focus trapping, Esc and backdrop close come from the browser. */
export function Dialog({
  title,
  description,
  children,
  onClose,
  wide,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby="dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === ref.current && onClose()}
      className={cn(
        "m-auto w-[calc(100%-2rem)] rounded-2xl border border-line bg-surface p-6 text-ink shadow-(--shadow-pop)",
        "backdrop:bg-ink/30 backdrop:backdrop-blur-[2px] open:animate-rise",
        wide ? "max-w-xl" : "max-w-md",
      )}
    >
      <div className="mb-4 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 id="dialog-title" className="text-lg font-semibold tracking-tight">{title}</h2>
          {description && <div className="mt-1 text-sm text-muted">{description}</div>}
        </div>
        <button type="button" onClick={onClose} className="rounded-md p-1 text-muted hover:bg-sunken hover:text-ink" aria-label="Close">
          <X className="size-4" />
        </button>
      </div>
      {children}
    </dialog>
  );
}
