"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import * as Sentry from "@sentry/nextjs";
import {
  ErrorShell,
  ErrorShellLink,
} from "@/components/oh/error-shell";
import { Button } from "@/components/ui/button";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("AppError");
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <ErrorShell
      label={t("label")}
      title={t("title")}
      description={t("description")}
      actions={
        <Button
          type="button"
          variant="oh"
          size="oh"
          onClick={() => reset()}
        >
          {t("tryAgain")}
        </Button>
      }
    >
      <ErrorShellLink
        href="/"
        title={t("homeTitle")}
        description={t("homeDescription")}
      />
      <ErrorShellLink
        href="/bookings"
        title={t("bookingsTitle")}
        description={t("bookingsDescription")}
      />
      {error.digest ? (
        <li className="font-[family-name:var(--oh-mono)] text-[10px] tracking-[1.5px] uppercase opacity-55">
          {t("digestLabel", { digest: error.digest })}
        </li>
      ) : null}
    </ErrorShell>
  );
}
