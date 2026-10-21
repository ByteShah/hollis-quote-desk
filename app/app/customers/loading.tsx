import { Skeleton } from "@/components/ui";
import { HeaderSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading customers">
      <HeaderSkeleton />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-48 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
