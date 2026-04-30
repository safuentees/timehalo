import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { createPrivateSSRHelper } from "@/trpc/server-helpers";
import { getRuntimeTimezones } from "@/lib/timezone";
import { GeneralSection } from "./components/general-section";

export default async function SettingsGeneralPage() {
  const trpc = await createPrivateSSRHelper();
  await trpc.users.me.prefetch();

  // Resolve timezones server-side. Node ICU vs browser ICU disagree on
  // alias rows (Africa/Asmera vs Africa/Asmara) — see the original
  // settings/page.tsx comment. Same constraint, same fix.
  const timezones = getRuntimeTimezones();

  return (
    <HydrationBoundary state={dehydrate(trpc.queryClient)}>
      <GeneralSection timezones={timezones} />
    </HydrationBoundary>
  );
}
