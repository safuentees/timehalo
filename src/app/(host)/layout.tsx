import type { ReactNode } from "react";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { OhProviders } from "@/components/oh/providers";
import { OhDashboardLayout } from "@/components/oh/oh-dashboard-layout";
import { DevChecklistMount } from "@/components/oh/dev-checklist-mount";
import { DevNotesMount } from "@/components/oh/dev-notes-mount";
import { createPrivateSSRHelper } from "@/trpc/server-helpers";

// Layout-level prefetch (B.PT41). The dashboard chrome (sidebar + top
// bar + user menu) reads two "global" queries:
//   • `users.me`        — drives the avatar initials, name, handle pill
//   • `workspaces.list` — drives the workspace switcher's active label
//
// Without prefetching these AT THE LAYOUT, the chrome reads empty data
// on first paint of every host route, then snaps to real values once
// the client-side fetch resolves — visible flash on every route entry
// that doesn't independently prefetch them on its page.tsx.
//
// Solution: prefetch both queries here in the server-side layout +
// wrap the whole tree in a `<HydrationBoundary>`. The dashboard chrome
// reads hydrated data on first paint regardless of which page inside
// the layout the user is on. Page-level `<HydrationBoundary>`s nest
// inside this one — Tanstack's `hydrate` is additive into the
// singleton browser queryClient, so both contribute to the same cache
// and per-page prefetches still cover the data their pages need.
//
// Pattern reference: cal.com's `<Shell>` component reads from a
// cache populated by an upstream layout prefetch. dub's equivalent
// uses SWR + a client-side `<WorkspaceAuth>` gate that blocks the
// entire layout behind a loader (heavier — the chrome itself
// flashes). We follow cal.com's lighter approach: prefetch + hydrate.
//
// Parallel @modal slot (A7). The intercepted route at
// (host)/@modal/(.)bookings/[publicUid] renders a Sheet here when
// the host navigates from /bookings to /bookings/<publicUid>; on
// hard refresh of the same URL it falls through to the full page
// route at (host)/bookings/[publicUid]. Default fallback is
// (host)/@modal/default.tsx — null when no intercepted route
// matches.
export default async function DashboardLayout({
  children,
  modal,
}: Readonly<{
  children: ReactNode;
  modal: ReactNode;
}>) {
  const trpc = await createPrivateSSRHelper();
  await Promise.all([
    trpc.users.me.prefetch(),
    trpc.workspaces.list.prefetch(),
  ]);

  return (
    <OhProviders>
      <HydrationBoundary state={dehydrate(trpc.queryClient)}>
        <OhDashboardLayout>{children}</OhDashboardLayout>
        {modal}
        {/* Admin-only floating dev checklist (B.PT75). Returns null
            for non-admin handles so the markdown blob + the launcher
            chrome never ship to non-admin clients. */}
        <DevChecklistMount />
        {/* Admin-only floating dev notes (B.PT79). Sits next to the
            checklist FAB. Same admin gate. */}
        <DevNotesMount />
      </HydrationBoundary>
    </OhProviders>
  );
}
