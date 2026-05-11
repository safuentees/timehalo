import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TRPCError } from "@trpc/server";
import { auth } from "@/auth";
import { createPublicSSRHelper } from "@/trpc/server-helpers";
import { env } from "@/env";
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

  // Owner detection — compare the visiting session's user.id against
  // the host's user.id resolved from the URL handle. When they match,
  // surface a quiet "Back to dashboard" affordance so the host can
  // return to /bookings without retyping the URL. Computed entirely
  // server-side so the affordance is part of the SSR pass — no
  // post-hydration flash, no client-only branch.
  const session = await auth();
  const isOwner =
    session?.user?.id !== undefined && session.user.id === user.id;

  // G6 — JSON-LD Person schema for rich Google search results. The
  // image field is omitted when the host hasn't uploaded an avatar
  // yet (Google's Person schema treats image as optional). url is
  // canonical so search results link back to the public profile,
  // not /booked/<uid> or /embed/<handle>.
  const baseUrl = env.NEXT_PUBLIC_APP_URL ?? "https://officehours.app";
  const personLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: user.name ?? `@${handle}`,
    url: `${baseUrl}/h/${handle}`,
    ...(user.image ? { image: user.image } : {}),
    identifier: handle,
  };

  return (
    <>
      <script
        type="application/ld+json"
        // JSON-LD as inline <script> per schema.org guidance + the
        // Next.js JSON-LD recipe (next.js/docs `app/getting-started/
        // metadata-and-og-images.mdx`). Stringified once at SSR time;
        // safe because the values come from typed Prisma fields, not
        // user-controlled HTML.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(personLd) }}
      />
      <HostProfile
        handle={handle}
        initialUser={user}
        initialSlots={slots}
        renderedAt={renderedAt}
        isOwner={isOwner}
      />
    </>
  );
}
