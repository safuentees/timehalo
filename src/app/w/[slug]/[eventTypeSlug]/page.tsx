import { notFound } from "next/navigation";
import { TRPCError } from "@trpc/server";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { createPublicSSRHelper } from "@/trpc/server-helpers";
import { TeamBookingFlow } from "./components/team-booking-flow";

// B.PT62b — visitor surface for team event types. Mirrors
// `/h/<handle>/page.tsx` shape: prefetch event-type metadata + slot
// list, hand both to the client component which renders the booking
// surface. Branch 5 (host hidden until confirmation) means we don't
// expose the host pool's names — only avatars + count.
export default async function TeamEventTypePage({
  params,
}: {
  params: Promise<{ slug: string; eventTypeSlug: string }>;
}) {
  const { slug, eventTypeSlug } = await params;
  const trpc = await createPublicSSRHelper();

  let eventType;
  let slots;
  try {
    [eventType, slots] = await Promise.all([
      trpc.workspaces.publicGetEventType.fetch({ slug, eventTypeSlug }),
      trpc.workspaces.publicGetUpcomingSlotsForEventType.fetch({
        slug,
        eventTypeSlug,
        days: 7,
      }),
    ]);
  } catch (err) {
    if (err instanceof TRPCError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  return (
    <HydrationBoundary state={dehydrate(trpc.queryClient)}>
      <TeamBookingFlow
        slug={slug}
        eventTypeSlug={eventTypeSlug}
        initialEventType={eventType}
        initialSlots={slots}
        renderedAt={new Date().toISOString()}
      />
    </HydrationBoundary>
  );
}
