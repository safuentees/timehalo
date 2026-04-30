import { OhPageHeader } from "@/components/oh/page-header";
import { OhPageShell } from "@/components/oh/page-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function BookingsLoading() {
  return (
    <OhPageShell wide>
      <OhPageHeader title="Your bookings" />
      <div className="mt-6 flex gap-2">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-16" />
      </div>
      <ul role="list" className="mt-5 flex flex-col gap-2.5">
        {[0, 1, 2].map((i) => (
          <li
            key={i}
            className="flex items-center justify-between gap-4 rounded-(--oh-r-sm) border-[1.5px] border-oh-line p-4"
          >
            <div className="flex flex-col gap-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-4 w-44" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="h-8 w-20 shrink-0" />
          </li>
        ))}
      </ul>
    </OhPageShell>
  );
}
