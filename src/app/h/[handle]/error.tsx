"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import * as Sentry from "@sentry/nextjs";
import { Button } from "@/components/ui/button";

// E4 — Visitor-surface error boundary. Next App Router renders this
// INSIDE `src/app/h/[handle]/layout.tsx` so the `oh-root` shell stays
// mounted while the route content area surfaces the error UI. Without
// this file, a thrown error inside the host profile bubbles to the
// root `src/app/error.tsx` which loses the visitor chrome (and the
// link back to the host's profile).
//
// Sentry capture mirrors the dashboard error.tsx so both surfaces
// feed the same sink. `reset()` re-mounts the segment for one-tap
// retry.

export default function VisitorError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("VisitorError");
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-prose flex-col gap-6 px-4 py-16 sm:px-6 sm:py-24">
      <p className="oh-eyebrow">{t("label")}</p>
      <h1 className="text-[clamp(1.75rem,1rem+3vw,2.5rem)] font-extrabold tracking-tight">
        {t("title")}
      </h1>
      <p className="oh-description">{t("body")}</p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button type="button" variant="oh" size="oh" onClick={() => reset()}>
          {t("tryAgain")}
        </Button>
      </div>
      {error.digest ? (
        <p className="oh-eyebrow tabular-nums opacity-55">
          {t("reference", { digest: error.digest })}
        </p>
      ) : null}
    </div>
  );
}
