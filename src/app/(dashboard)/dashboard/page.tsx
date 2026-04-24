import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { createPrivateSSRHelper } from "@/trpc/server-helpers";
import SettingsForm from "./components/settings-form";

export default async function Page() {
  const trpc = await createPrivateSSRHelper();

  await Promise.all([
    trpc.schedule.get.prefetch(),
    trpc.users.me.prefetch(),
  ]);

  return (
    <main className="bru-main">
      <HydrationBoundary state={dehydrate(trpc.queryClient)}>
        <SettingsForm />
      </HydrationBoundary>
    </main>
  );
}
