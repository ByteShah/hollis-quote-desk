"use client";

import { useEffect } from "react";
import { RotateCcw, TriangleAlert } from "lucide-react";
import { Button, LinkButton } from "@/components/ui";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Only the digest: the message may contain request details.
    console.error("page error", error.digest);
  }, [error]);

  return (
    <div className="card mx-auto mt-10 max-w-md px-6 py-10 text-center animate-rise">
      <div className="mx-auto mb-4 grid size-12 place-items-center rounded-xl bg-red-50 ring-1 ring-red-200">
        <TriangleAlert className="size-5 text-red-600" aria-hidden />
      </div>
      <h1 className="font-semibold">Something went wrong</h1>
      <p className="mt-1 text-sm text-muted">Nothing has been lost. Try again, and if it keeps happening, reload the page.</p>
      {error.digest && <p className="mt-3 font-mono text-[11px] text-muted">Ref: {error.digest}</p>}
      <div className="mt-6 flex justify-center gap-2">
        <LinkButton href="/app/quotes" variant="secondary">Back to quotes</LinkButton>
        <Button onClick={reset}>
          <RotateCcw className="size-4" /> Try again
        </Button>
      </div>
    </div>
  );
}
