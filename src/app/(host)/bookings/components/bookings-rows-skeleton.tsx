import { Skeleton } from "@/components/ui/skeleton";

// Fallback for the rows-only Suspense boundary in `page.tsx`. Mirrors
// the divided-list shape — hairline frame + 3 row skeletons stacked
// with hairline dividers. Page chrome (header + tabs + onboarding)
// is NOT in this skeleton because it renders synchronously above the
// Suspense boundary; only the rows area suspends.
export function BookingsRowsSkeleton() {
  return (
    <div className="mt-6">
      <ul
        role="list"
        aria-busy="true"
        className="border-y border-oh-line divide-y divide-oh-line"
      >
        {[0, 1, 2].map((i) => (
          <li key={i} className="px-4 py-4">
            <div className="flex items-baseline justify-between gap-4">
              <Skeleton className="h-4 w-44" />
              <Skeleton className="h-3 w-16" />
            </div>
            <Skeleton className="mt-2 h-3 w-24" />
            <Skeleton className="mt-2 h-3 w-56" />
          </li>
        ))}
      </ul>
    </div>
  );
}
