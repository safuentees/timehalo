import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { createPrivateSSRHelper } from "@/trpc/server-helpers";
import { DeveloperSection } from "./components/developer-section";

export default async function SettingsDeveloperPage() {
  const trpc = await createPrivateSSRHelper();

  // Mirror the original eager-nested-prefetch (api keys depend on the
  // active workspace slug). Without this the API keys list flashes
  // "Loading…" on first paint while every other section is hydrated.
  // Cal.com pattern (settings/developer/api-keys/page.tsx).
  const workspaces = await trpc.workspaces.list.fetch();
  const firstSlug = workspaces[0]?.slug;
  if (firstSlug) {
    await trpc.workspaces.apiKeys.list.prefetch({ slug: firstSlug });
  }

  return (
    <HydrationBoundary state={dehydrate(trpc.queryClient)}>
      <DeveloperSection />
    </HydrationBoundary>
  );
}
