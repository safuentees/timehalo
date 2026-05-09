import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { createPrivateSSRHelper } from "@/trpc/server-helpers";
import { DeveloperSection } from "./components/developer-section";

export default async function SettingsDeveloperPage() {
  const trpc = await createPrivateSSRHelper();

  const workspaces = await trpc.workspaces.list.fetch();
  const activeSlug =
    workspaces.find((w) => w.isActive)?.slug ?? workspaces[0]?.slug;
  if (activeSlug) {
    await Promise.all([
      trpc.workspaces.apiKeys.list.prefetch({ slug: activeSlug }),
      trpc.webhooks.list.prefetch({ slug: activeSlug }),
      trpc.billing.currentPlan.prefetch({ slug: activeSlug }),
    ]);
  }

  return (
    <HydrationBoundary state={dehydrate(trpc.queryClient)}>
      <DeveloperSection />
    </HydrationBoundary>
  );
}
