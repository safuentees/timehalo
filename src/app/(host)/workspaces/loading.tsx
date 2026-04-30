import { OhPageHeader } from "@/components/oh/page-header";
import { OhPageShell } from "@/components/oh/page-shell";
import { Skeleton } from "@/components/ui/skeleton";

// Three workspace-row skeletons — matches the workspaces-list card
// stack at `/workspaces/components/workspaces-list.tsx`.
export default function WorkspacesLoading() {
  return (
    <OhPageShell>
      <OhPageHeader title="Workspaces" />
      <ul role="list" className="mt-8 flex flex-col gap-2.5">
        {[0, 1, 2].map((i) => (
          <li
            key={i}
            className="flex items-center justify-between gap-4 rounded-(--oh-r-sm) border-[1.5px] border-oh-line p-4"
          >
            <div className="flex flex-col gap-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-4 w-40" />
            </div>
            <Skeleton className="h-8 w-24 shrink-0" />
          </li>
        ))}
      </ul>
    </OhPageShell>
  );
}
