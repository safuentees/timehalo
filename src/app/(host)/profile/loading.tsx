import { OhPageHeader } from "@/components/oh/page-header";
import { OhPageShell } from "@/components/oh/page-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function ProfileLoading() {
  return (
    <OhPageShell>
      <OhPageHeader title="Public profile" />
      <div className="mt-8 flex flex-col gap-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-72" />
        <Skeleton className="mt-2 h-11 w-full max-w-md" />
      </div>
      <div className="mt-10 flex justify-end">
        <Skeleton className="h-10 w-40" />
      </div>
    </OhPageShell>
  );
}
