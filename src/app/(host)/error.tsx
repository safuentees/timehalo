"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("HostError");
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <OhPageShell>
      <OhPageHeader title={t("title")} />
      <div className="mt-8 flex flex-col gap-6">
        <p className="oh-description">{t("body")}</p>
        {error.digest ? (
          <p className="oh-eyebrow tabular-nums opacity-65">
            {t("reference", { digest: error.digest })}
          </p>
        ) : null}
        <div>
          <Button type="button" variant="oh" size="oh" onClick={() => reset()}>
            {t("tryAgain")}
          </Button>
        </div>
      </div>
    </OhPageShell>
  );
}
