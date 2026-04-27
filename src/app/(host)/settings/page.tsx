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
    // workspaces.list feeds the API keys section's workspace picker.
    // Without prefetch the section flashed "Loading…" on first paint
    // while every other section rendered instantly from the hydration
    // cache. Same pattern as rallly's settings/api-keys page (server
    // helpers prefetch → dehydrate → HydrationBoundary). Reference:
    // tRPC v11 App Router prefetch docs (Context7 /trpc/trpc).
    trpc.workspaces.list.prefetch(),
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
