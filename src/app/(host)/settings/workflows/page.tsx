import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { createPrivateSSRHelper } from "@/trpc/server-helpers";
import { WorkflowsSection } from "./components/workflows-section";

export default async function SettingsWorkflowsPage() {
  const trpc = await createPrivateSSRHelper();
  await trpc.workflows.list.prefetch();

  return (
    <HydrationBoundary state={dehydrate(trpc.queryClient)}>
      <WorkflowsSection />
    </HydrationBoundary>
  );
}
