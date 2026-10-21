import { FileQuestion } from "lucide-react";
import { LinkButton } from "@/components/ui";

// Also what another company's quote URL shows: no hint that it exists.
export default function NotFound() {
  return (
    <main className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="max-w-sm text-center animate-rise">
        <div className="mx-auto mb-4 grid size-12 place-items-center rounded-xl bg-sunken ring-1 ring-line">
          <FileQuestion className="size-5 text-muted" aria-hidden />
        </div>
        <h1 className="text-lg font-semibold">Page not found</h1>
        <p className="mt-1 text-sm text-muted">It may have been moved, or you may not have access to it.</p>
        <LinkButton href="/app/quotes" variant="secondary" className="mt-6">
          Go to quotes
        </LinkButton>
      </div>
    </main>
  );
}
