"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { OhPageHeader } from "@/components/oh/page-header";
import { OhPageShell } from "@/components/oh/page-shell";
import { Button } from "@/components/ui/button";

// Segment-level error boundary for the (host) route group. Next App
// Router renders error.tsx INSIDE the parent layout, so the dashboard
// chrome (top bar + sidebar) stays mounted while just the route's
// content area renders the error UI. Without this file, a thrown
// render error inside /bookings or /availability bubbles to the root
// `src/app/error.tsx` which replaces the full screen — the host loses
// the sidebar context entirely.
//
// Pattern reference: cal.com adds `error.tsx` per major route group
// (`apps/web/app/(use-page-wrapper)/error.tsx`) so the sidebar stays
// up while the inset shows the error. We follow.
//
// Sentry capture matches the root error.tsx so both surfaces feed the
// same sink. `reset()` is the App Router primitive that re-mounts the
// route segment — gives the user a one-tap retry.

export default function HostError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <OhPageShell>
      <OhPageHeader title="Something went sideways" />
      <div className="mt-8 flex flex-col gap-6">
        <p className="oh-description">
          An unexpected error fired on this page. The booking flow
          itself is unaffected — try again, or pick a different
          section from the sidebar.
        </p>
        {error.digest ? (
          <p className="oh-eyebrow tabular-nums opacity-65">
            Reference {error.digest}
          </p>
        ) : null}
        <div>
          <Button type="button" variant="oh" size="oh" onClick={() => reset()}>
            Try again
          </Button>
        </div>
      </div>
    </OhPageShell>
  );
}
