import { Skeleton } from "./ui";

// Route-level loading states. Next streams these instantly on navigation, so
// the shell never blanks while a page's data loads.

export function HeaderSkeleton() {
  return (
    <div className="mb-6 space-y-2">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-4 w-80 max-w-full" />
    </div>
  );
}

export function StatsSkeleton() {
  return (
    <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="card space-y-2.5 px-4 py-3.5">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-7 w-14" />
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-line/70 px-4 py-3">
        <Skeleton className="h-8 w-64 max-w-full" />
      </div>
      <div className="divide-y divide-line/70">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3.5">
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-2/3" />
            </div>
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
