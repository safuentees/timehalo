import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TRPCError } from "@trpc/server";
import { createPublicSSRHelper } from "@/trpc/server-helpers";
import HostProfile from "./components/host-profile";

// G1 — per-route metadata. Pulls the host's name + handle from the
// public profile query so the title surfaces "Maya — Officehours"
// instead of the generic root layout title. Fallback to "@<handle>"
// when the user has no display name set yet (the same fallback
// HostProfile uses).
export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}): Promise<Metadata> {
  const { handle } = await params;
  const trpc = await createPublicSSRHelper();
  try {
    const user = await trpc.users.getByHandle.fetch({ handle });
    const displayName = user.name ?? `@${handle}`;
    const description = `Book a 1:1 with ${displayName} on Officehours.`;
    return {
      title: `${displayName} — Officehours`,
      description,
      openGraph: {
        title: `${displayName} — Officehours`,
        description,
        type: "profile",
        url: `/h/${handle}`,
      },
      twitter: {
        card: "summary_large_image",
        title: `${displayName} — Officehours`,
        description,
      },
    };
  } catch {
    // Handle 404 / unreachable — defer to the page's notFound()
    // path; this just provides a safe metadata fallback so the
    // 404 frame still renders sensible chrome.
    return {
      title: `@${handle} — Officehours`,
    };
  }
}

export default async function HostPage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const trpc = await createPublicSSRHelper();
  const renderedAt = new Date().toISOString();
  let user;
  let slots;

  try {
    [user, slots] = await Promise.all([
      trpc.users.getByHandle.fetch({ handle }),
      trpc.schedule.getUpcomingSlots.fetch({ handle }),
    ]);
  } catch (err) {
    if (err instanceof TRPCError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  return (
    <HostProfile
      handle={handle}
      initialUser={user}
      initialSlots={slots}
      renderedAt={renderedAt}
    />
  );
}
