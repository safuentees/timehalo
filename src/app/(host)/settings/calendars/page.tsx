import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { createPrivateSSRHelper } from "@/trpc/server-helpers";
import { CalendarsSection } from "./components/calendars-section";

export default async function SettingsCalendarsPage() {
  const trpc = await createPrivateSSRHelper();
  await trpc.calendar.connections.prefetch();

  return (
    <HydrationBoundary state={dehydrate(trpc.queryClient)}>
      <CalendarsSection />
    </HydrationBoundary>
  );
}
