import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { createPrivateSSRHelper } from "@/trpc/server-helpers";
import { DeveloperSection } from "./components/developer-section";

export default async function SettingsDeveloperPage() {
  const trpc = await createPrivateSSRHelper();

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
