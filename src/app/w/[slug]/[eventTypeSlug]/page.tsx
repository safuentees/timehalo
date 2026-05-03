import { notFound } from "next/navigation";
import { TRPCError } from "@trpc/server";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { createPublicSSRHelper } from "@/trpc/server-helpers";
import { TeamBookingFlow } from "./components/team-booking-flow";

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
