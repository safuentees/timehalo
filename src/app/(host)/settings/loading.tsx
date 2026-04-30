import { OhPageHeader } from "@/components/oh/page-header";
import { OhPageShell } from "@/components/oh/page-shell";
import { Skeleton } from "@/components/ui/skeleton";

// One loading.tsx covers every /settings/* sub-route — Next App Router
// segments inherit the nearest loading boundary. Keeps the chrome
// frame steady while the prefetch round-trip resolves on first
// navigation. Per-section data falls in via the HydrationBoundary on
// the destination page.tsx.
export default function SettingsLoading() {
  return (
    <OhPageShell tight>
      <OhPageHeader title="Settings" />
      <div className="mt-8 flex flex-col gap-12">
        {[0, 1].map((i) => (
          <section key={i} className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-64" />
            </div>
            <Skeleton className="h-11 w-full max-w-[260px]" />
          </section>
        ))}
      </div>
    </OhPageShell>
  );
}
