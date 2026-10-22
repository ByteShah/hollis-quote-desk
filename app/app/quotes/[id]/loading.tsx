import { Skeleton } from "@/components/ui";

// Same shape as the quote page, so nothing jumps when it arrives.
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading quote">
      <Skeleton className="mb-3 h-4 w-32" />
      <div className="mb-5 space-y-2">
        <div className="flex gap-1.5">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-5 w-24 rounded-full" />
          <Skeleton className="h-5 w-28 rounded-full" />
        </div>
        <Skeleton className="h-7 w-80 max-w-full" />
        <Skeleton className="h-4 w-56" />
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <Skeleton className="h-9 w-[30rem] max-w-full rounded-lg" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
        <div className="space-y-5">
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-36 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
