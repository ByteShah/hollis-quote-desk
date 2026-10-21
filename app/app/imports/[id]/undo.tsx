"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui";
import { Dialog } from "@/components/dialog";
import { undoImport } from "../actions";

export function UndoImportButton({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Undo2 className="size-4" /> Undo import
      </Button>
      {open && (
        <Dialog
          title="Undo this import?"
          description="New records are removed (or archived if a quote already uses them), updated records go back to how they were, and imported prices are removed. Anything edited since the import is left alone."
          onClose={() => !pending && setOpen(false)}
        >
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
            <Button
              variant="danger"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await undoImport(id);
                  if (!res.ok) return void toast.error(res.error);
                  const sk = res.summary.skipped.length;
                  toast.success(`Import undone${sk ? `; ${sk} record${sk === 1 ? "" : "s"} left as edited` : ""}`);
                  setOpen(false);
                  router.refresh();
                })
              }
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Undo2 className="size-4" />} Undo import
            </Button>
          </div>
        </Dialog>
      )}
    </>
  );
}
