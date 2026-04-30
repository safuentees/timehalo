import { OhPageHeader } from "@/components/oh/page-header";
import { OhPageShell } from "@/components/oh/page-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function AvailabilityLoading() {
  return (
    <OhPageShell>
      <OhPageHeader title="Hours" />
      <div className="mt-8 flex flex-col gap-6">
        <Skeleton className="h-3 w-40" />
        {[0, 1].map((i) => (
          <div key={i} className="flex flex-col gap-3">
            <Skeleton className="h-4 w-28" />
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-9 w-32" />
              <Skeleton className="h-9 w-32" />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-10 flex justify-end border-t-2 border-oh-line-strong pt-6">
        <Skeleton className="h-10 w-40" />
      </div>
    </OhPageShell>
  );
}
