import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { createPrivateSSRHelper } from "@/trpc/server-helpers";
import { getRuntimeTimezones } from "@/lib/timezone";
import SettingsForm from "./components/settings-form";

export default async function SettingsPage() {
  const trpc = await createPrivateSSRHelper();

  const [workspaces] = await Promise.all([
    trpc.workspaces.list.fetch(),
    trpc.users.me.prefetch(),
    trpc.workflows.list.prefetch(),
    trpc.calendar.connections.prefetch(),
  ]);

  const firstSlug = workspaces[0]?.slug;
  if (firstSlug) {
    await Promise.all([
      trpc.workspaces.apiKeys.list.prefetch({ slug: firstSlug }),
      trpc.billing.currentPlan.prefetch({ slug: firstSlug }),
    ]);
  }

  const timezones = getRuntimeTimezones();

  return (
    <HydrationBoundary state={dehydrate(trpc.queryClient)}>
      <SettingsForm timezones={timezones} />
    </HydrationBoundary>
  );
}
