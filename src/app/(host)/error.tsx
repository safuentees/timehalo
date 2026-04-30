"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { OhPageHeader } from "@/components/oh/page-header";
import { OhPageShell } from "@/components/oh/page-shell";
import { Button } from "@/components/ui/button";

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
