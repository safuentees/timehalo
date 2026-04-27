import { redirect } from "next/navigation";
import { TRPCError } from "@trpc/server";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { createPublicSSRHelper } from "@/trpc/server-helpers";
import { EmbedFrame } from "./embed-frame";

// Embed-mode host page (C1). Renders the same slot picker as
// /h/[handle] but inside a sandbox-friendly shell — no global nav,
// no theme toggle, no marketing chrome. The parent loads this URL
// in an iframe and listens for postMessage updates.
//
// Pattern reference: cal /packages/embeds/LIFECYCLE.md:1-47 — the
// iframe is the "owned content"; the parent's `<script>` is the
// host-customization layer. We post `originator: "OH"` so multiple
// embeds can coexist without crossing wires.

export default async function EmbedHostPage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const trpc = await createPublicSSRHelper();

  let initialUser: Awaited<
    ReturnType<typeof trpc.users.getByHandle.fetch>
  >;
  let initialSlots: Awaited<
    ReturnType<typeof trpc.schedule.getUpcomingSlots.fetch>
  >;
  try {
    initialUser = await trpc.users.getByHandle.fetch({ handle });
    initialSlots = await trpc.schedule.getUpcomingSlots.fetch({
      handle,
      days: 7,
    });
  } catch (cause) {
    if (cause instanceof TRPCError && cause.code === "NOT_FOUND") {
      redirect("/");
    }
    throw cause;
  }

  return (
    <HydrationBoundary state={dehydrate(trpc.queryClient)}>
      <EmbedFrame
        handle={handle}
        initialUser={initialUser}
        initialSlots={initialSlots}
        renderedAt={new Date().toISOString()}
      />
    </HydrationBoundary>
  );
}
