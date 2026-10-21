import { HeaderSkeleton, StatsSkeleton, TableSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading price list">
      <HeaderSkeleton />
      <StatsSkeleton />
      <TableSkeleton />
    </div>
  );
}
