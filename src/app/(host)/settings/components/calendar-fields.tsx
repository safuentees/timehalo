"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { trpc } from "@/trpc/hooks";
import { useCalendarAuthUrl } from "@/lib/mutations/use-calendar-auth-url";
import { useCalendarDisconnect } from "@/lib/mutations/use-calendar-disconnect";
import { Button } from "@/components/ui/button";
import { getQueryParam, updateQueryParams } from "@/lib/url-params";
import { CalendarPickDialog } from "./calendar-pick-dialog";
import { SectionHeader } from "@/components/brutalist/section-header";

type Provider = "GOOGLE" | "MICROSOFT";
const PROVIDERS: Provider[] = ["GOOGLE", "MICROSOFT"];

export function CalendarFields() {
  const t = useTranslations("Calendar");
  const [pickFor, setPickFor] = useState<{
    credentialId: string;
    email: string | null;
  } | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);

  const { data: connections } = trpc.calendar.connections.useQuery();

  useEffect(() => {
    const connected = getQueryParam("calendarConnected");
    const errored = getQueryParam("calendarError");
    if (connected) {
      toast.success(t("connectSuccess"));
      updateQueryParams({ calendarConnected: null });
    } else if (errored) {
      toast.error(t("connectErrorWithCode", { code: errored }));
      updateQueryParams({ calendarError: null });
    }
  }, [t]);

  const authUrl = useCalendarAuthUrl({
    onError: (error) => {
      if (error.data?.code === "PRECONDITION_FAILED") {
        setNotConfigured(true);
      }
    },
  });
  const disconnect = useCalendarDisconnect();

  const connectedProviders = new Set(
    (connections ?? []).map((c) => c.provider),
  );

  function onConnect(provider: Provider) {
    setNotConfigured(false);
    authUrl.mutate({ provider });
  }

  return (
    <section aria-labelledby="calendar-legend">
      <SectionHeader
        legendId="calendar-legend"
        legend={t("legend")}
        description={t("description")}
      />

      {connections && connections.length > 0 ? (
        <ul
          role="list"
          aria-labelledby="calendar-legend"
          className="mt-5 flex flex-col gap-2.5"
        >
          {connections.map((c) => (
            <li key={c.id}>
              <article className="rounded-(--bru-r-sm) border-[1.5px] border-bru-line bg-bru-bg p-4 transition-colors duration-150 ease-bru hover:border-bru-line-strong">
                <header className="flex min-w-0 flex-col gap-1.5">
                  <p className="bru-eyebrow">
                    {t(
                      `provider${c.provider}` as
                        | "providerGOOGLE"
                        | "providerMICROSOFT",
                    )}
                  </p>
                  <h3 className="truncate text-[16px] font-black leading-[1.2]">
                    {c.externalAccountEmail}
                  </h3>
                </header>
                <p className="mt-2 text-[12px] opacity-65">
                  {t("selectedCount", { count: c._count.selectedCalendars })}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="brutalistGhost"
                    size="brutalist"
                    onClick={() =>
                      setPickFor({
                        credentialId: c.id,
                        email: c.externalAccountEmail,
                      })
                    }
                  >
                    {t("manage")}
                  </Button>
                  <Button
                    type="button"
                    variant="brutalistGhost"
                    size="brutalist"
                    onClick={() =>
                      disconnect.mutate({ credentialId: c.id })
                    }
                    disabled={disconnect.isPending}
                  >
                    {t("disconnect")}
                  </Button>
                </div>
              </article>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {PROVIDERS.filter((p) => !connectedProviders.has(p)).map(
          (provider) => (
            <Button
              key={provider}
              type="button"
              variant="brutalist"
              size="brutalist"
              onClick={() => onConnect(provider)}
              disabled={authUrl.isPending}
            >
              {t(`connect${provider}` as
                | "connectGOOGLE"
                | "connectMICROSOFT")}
            </Button>
          ),
        )}
      </div>

      {notConfigured ? (
        <p className="mt-3 text-[12px] opacity-65 max-w-prose">
          {t("providerNotConfigured")}
        </p>
      ) : null}

      <CalendarPickDialog
        credentialId={pickFor?.credentialId ?? null}
        externalAccountEmail={pickFor?.email ?? null}
        onClose={() => setPickFor(null)}
      />
    </section>
  );
}
