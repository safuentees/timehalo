import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { createPrivateSSRHelper } from "@/trpc/server-helpers";
import SettingsForm from "./components/settings-form";

export default async function Page() {
  const trpc = await createPrivateSSRHelper();

  // Prefetch both queries the settings form reads so data is in the
  // hydrated cache on first paint — no loading flash on the client.
  await Promise.all([
    trpc.schedule.get.prefetch(),
    trpc.users.me.prefetch(),
  ]);

  return (
    <main className="bru-main">
      <section className="mx-auto w-full max-w-[640px] px-4 py-8 sm:px-6 sm:py-10">
        <HydrationBoundary state={dehydrate(trpc.queryClient)}>
          <SettingsForm />
        </HydrationBoundary>
      </section>
    </main>
  );
}
