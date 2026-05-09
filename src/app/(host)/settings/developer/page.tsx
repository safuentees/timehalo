import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { createPrivateSSRHelper } from "@/trpc/server-helpers";
import { DeveloperSection } from "./components/developer-section";

export default async function SettingsDeveloperPage() {
  const trpc = await createPrivateSSRHelper();

  // Mirror the original eager-nested-prefetch (api keys depend on the
  // active workspace slug). Without this the API keys list flashes
  // "Loading…" on first paint while every other section is hydrated.
  // Cal.com pattern (settings/developer/api-keys/page.tsx).
  //
  // Active-workspace selection mirrors the client logic in
  // `api-keys-fields.tsx` / `webhooks-fields.tsx`:
  //   isActive workspace > workspaces[0]
  // Using `[0]` blindly would prefetch the wrong workspace's keys /
  // webhooks / plan when the user has switched the active workspace
  // away from their first one — the section's first paint would then
  // mismatch the hydrated cache and trigger a re-fetch.
  //
  // Plan prefetch lands in the same Promise.all. Without it, the
  // `billing.currentPlan` query runs client-side after hydration and
  // the "Add API key" / "Add webhook" buttons render in the unlocked
  // state for one frame before flipping to the upgrade prompt for
  // FREE-tier users. Pre-resolving the plan during SSR means the
  // gate evaluates synchronously on first render — no flash of
  // pre-checked state.
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
