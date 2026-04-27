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
    <section>
      <p
        className="font-[family-name:var(--bru-mono)] text-[11px] font-extrabold tracking-[2.5px] uppercase opacity-55"
        id="calendar-fields-label"
      >
        {t("legend")}
      </p>
      <p className="mt-3 text-[13px] leading-[1.5] opacity-65 max-w-prose">
        {t("description")}
      </p>

      {connections && connections.length > 0 ? (
        <ul
          role="list"
          aria-labelledby="calendar-fields-label"
          className="mt-5 border-2 border-bru-line divide-y-2 divide-bru-line"
        >
          {connections.map((c) => (
            <li
              key={c.id}
              className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <p className="font-[family-name:var(--bru-mono)] text-[10px] font-extrabold tracking-[2px] uppercase opacity-55">
                  {t(`provider${c.provider}` as
                    | "providerGOOGLE"
                    | "providerMICROSOFT")}
                </p>
                <p className="mt-1 truncate text-[14px] font-semibold">
                  {c.externalAccountEmail}
                </p>
                <p className="mt-1 text-[12px] opacity-65">
                  {t("selectedCount", { count: c._count.selectedCalendars })}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 sm:flex-nowrap">
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
