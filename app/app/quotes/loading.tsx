import { HeaderSkeleton, StatsSkeleton, TableSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading quotes">
      <HeaderSkeleton />
      <StatsSkeleton />
      <TableSkeleton />
    </div>
  );
}
