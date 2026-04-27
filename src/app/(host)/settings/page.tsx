import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { createPrivateSSRHelper } from "@/trpc/server-helpers";
import { getRuntimeTimezones } from "@/lib/timezone";
import SettingsForm from "./components/settings-form";

export default async function SettingsPage() {
  const trpc = await createPrivateSSRHelper();
  await Promise.all([
    trpc.users.me.prefetch(),
    trpc.workflows.list.prefetch(),
    trpc.calendar.connections.prefetch(),
  ]);

  // Resolve the timezone list on the server so SSR + CSR render the
  // same <option> set. ICU data differs between Node and browsers
  // (e.g. Africa/Asmera vs Africa/Asmara) — computing in the client
  // would mismatch hydration.
  const timezones = getRuntimeTimezones();

  return (
    <HydrationBoundary state={dehydrate(trpc.queryClient)}>
      <SettingsForm timezones={timezones} />
    </HydrationBoundary>
  );
}
