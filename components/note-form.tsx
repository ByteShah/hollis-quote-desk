"use client";

import { useState, useTransition } from "react";
import { Loader2, MessageSquarePlus } from "lucide-react";
import { toast } from "sonner";
import { addNote } from "@/app/app/history-actions";
import { buttonClass } from "./ui";

export function NoteForm({ entity, entityId, path }: { entity: "rate" | "customer" | "quote"; entityId: string; path: string }) {
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={buttonClass("secondary", "sm")}>
        <MessageSquarePlus className="size-3.5" /> Add a note
      </button>
    );
  }
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await addNote({ entity, entityId, note, path });
          if (res.error) return void toast.error(res.error);
          setNote("");
          setOpen(false);
          toast.success("Note added");
        });
      }}
    >
      <label htmlFor={`note-${entityId}`} className="sr-only">Note</label>
      <textarea
        id={`note-${entityId}`}
        autoFocus
        rows={3}
        maxLength={2000}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="e.g. Rang Dave, price confirmed for 2027"
        className="input h-auto resize-y py-2"
      />
      <div className="flex justify-end gap-2">
        <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </button>
        <button className={buttonClass("primary", "sm")} disabled={pending || !note.trim()}>
          {pending && <Loader2 className="size-3.5 animate-spin" />} Save note
        </button>
      </div>
    </form>
  );
}
