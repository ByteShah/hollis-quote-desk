import { Skeleton } from "@/components/ui";
import { HeaderSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading settings">
      <HeaderSkeleton />
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <Skeleton className="h-96 rounded-xl" />
        <div className="space-y-5">
          <Skeleton className="h-44 rounded-xl" />
          <Skeleton className="h-60 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
