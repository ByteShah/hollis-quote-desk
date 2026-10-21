import { Skeleton } from "@/components/ui";
import { HeaderSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <HeaderSkeleton />
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <Skeleton className="h-[30rem] rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  );
}
