"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import {
  ErrorShell,
  ErrorShellLink,
} from "@/components/brutalist/error-shell";
import { Button } from "@/components/ui/button";

export default function ErrorPage({
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
    <ErrorShell
      label="Officehours / 500"
      title="Something went sideways."
      description="An unexpected error fired on this page. The booking flow itself is unaffected — try the link below, or reload."
      actions={
        <Button
          type="button"
          variant="brutalist"
          size="brutalist"
          onClick={() => reset()}
        >
          Try again
        </Button>
      }
    >
      <ErrorShellLink
        href="/"
        title="Home"
        description="Start over"
      />
      <ErrorShellLink
        href="/bookings"
        title="Your bookings"
        description="If you're a host"
      />
      {error.digest ? (
        <li className="font-[family-name:var(--bru-mono)] text-[10px] tracking-[1.5px] uppercase opacity-55">
          digest: {error.digest}
        </li>
      ) : null}
    </ErrorShell>
  );
}
