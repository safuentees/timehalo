import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { createPrivateSSRHelper } from "@/trpc/server-helpers";
import { BillingSection } from "./components/billing-section";

export default async function SettingsBillingPage() {
  const trpc = await createPrivateSSRHelper();

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
