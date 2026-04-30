import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { createPrivateSSRHelper } from "@/trpc/server-helpers";
import { WorkflowsSection } from "./components/workflows-section";

export default async function SettingsWorkflowsPage() {
  const trpc = await createPrivateSSRHelper();

  // `users.plan` (B.PT18) drives the workflow section's lock icon.
  // Without it prefetched, the icon flashes "unlocked" briefly while
  // the query loads then settles to "locked" for FREE users — a lie
  // that a server prefetch erases. Parallel with the list itself so
  // first paint sees both. (B.PT38 — port of the prefetch addition
  // from `cd702bf` on `fix/next-pin-16.1.7`, repointed at this
  // sub-route page after the B.PT21 settings split moved the workflow
  // section out of the legacy `/settings/page.tsx`.)
  await Promise.all([
    trpc.workflows.list.prefetch(),
    trpc.users.plan.prefetch(),
  ]);

  return (
    <HydrationBoundary state={dehydrate(trpc.queryClient)}>
      <WorkflowsSection />
    </HydrationBoundary>
  );
}
