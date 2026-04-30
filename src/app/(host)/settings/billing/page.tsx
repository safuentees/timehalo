import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { createPrivateSSRHelper } from "@/trpc/server-helpers";
import { BillingSection } from "./components/billing-section";

export default async function SettingsBillingPage() {
  const trpc = await createPrivateSSRHelper();

  // billing.currentPlan is workspace-scoped; eager-nest the prefetch
  // so the plan card hydrates instead of flashing "Loading…". Same
  // pattern the developer page uses for api-keys.
  const workspaces = await trpc.workspaces.list.fetch();
  const firstSlug = workspaces[0]?.slug;
  if (firstSlug) {
    await trpc.billing.currentPlan.prefetch({ slug: firstSlug });
  }

  return (
    <HydrationBoundary state={dehydrate(trpc.queryClient)}>
      <BillingSection />
    </HydrationBoundary>
  );
}
