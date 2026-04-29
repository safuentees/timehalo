import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { createPrivateSSRHelper } from "@/trpc/server-helpers";
import { getRuntimeTimezones } from "@/lib/timezone";
import SettingsForm from "./components/settings-form";

export default async function SettingsPage() {
  const trpc = await createPrivateSSRHelper();

  // Parallelize the independent queries; `workspaces.list.fetch()`
  // returns the data AND populates the cache, so we use the result to
  // chase the dependent `apiKeys.list({ slug })` prefetch.
  // Without the nested prefetch the API keys section flashes
  // "Loading…" on first paint while every other section renders from
  // the hydration cache. Cal.com does the eager-nested-prefetch
  // pattern (settings/developer/api-keys/page.tsx); Rallly stops at
  // parent-only and accepts the flash. We follow Cal — settings is
  // dense enough that a sub-section flashing alone reads as broken.
  const [workspaces] = await Promise.all([
    trpc.workspaces.list.fetch(),
    trpc.users.me.prefetch(),
    trpc.workflows.list.prefetch(),
    trpc.calendar.connections.prefetch(),
  ]);

  const firstSlug = workspaces[0]?.slug;
  if (firstSlug) {
    // Eager-nested prefetch so api-keys + billing read from the
    // hydration cache instead of flashing "Loading…" on first paint.
    // Cal.com's settings/developer pattern; see api-keys prefetch
    // comment above for the rationale.
    await Promise.all([
      trpc.workspaces.apiKeys.list.prefetch({ slug: firstSlug }),
      trpc.billing.currentPlan.prefetch({ slug: firstSlug }),
    ]);
  }

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
