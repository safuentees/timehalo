import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { createPrivateSSRHelper } from "@/trpc/server-helpers";
import { WorkflowsSection } from "./components/workflows-section";

export default async function SettingsWorkflowsPage() {
  const trpc = await createPrivateSSRHelper();

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
