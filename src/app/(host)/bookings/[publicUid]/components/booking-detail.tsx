"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Link } from "next-view-transitions";
import { useTranslations } from "next-intl";
import {
  ArrowLeftIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MailIcon,
} from "lucide-react";
import { trpc } from "@/trpc/hooks";
import { useCancelBooking } from "@/lib/mutations/use-cancel-booking";
import { Button } from "@/components/ui/button";
import { BrutalistInlineEmpty } from "@/components/brutalist/inline-empty";
import { BrutalistPageHeader } from "@/components/brutalist/page-header";
import { BrutalistPageShell } from "@/components/brutalist/page-shell";
import { BrutalistSection } from "@/components/brutalist/section";
import { ConfirmDialog } from "@/components/brutalist/confirm-dialog";

type Tab = "info" | "history";

const MONTH_SHORT = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
] as const;

function fmtDate(d: Date): string {
  return `${MONTH_SHORT[d.getMonth()]} ${d.getDate()} ${d.getFullYear()}`;
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function fmtAuditTimestamp(d: Date): string {
  return `${fmtDate(d)} ${fmtTime(d)}`;
}

export default function BookingDetail({
  publicUid,
  variant = "page",
}: {
  publicUid: string;
  variant?: "page" | "drawer";
}) {
  const router = useRouter();
  const t = useTranslations("BookingDetail");
  const { data } = trpc.bookings.getDetail.useQuery({ publicUid });
  const [tab, setTab] = useState<Tab>("info");
  const isDrawer = variant === "drawer";

  const previousUid = data?.previousUid ?? null;
  const nextUid = data?.nextUid ?? null;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const editing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target?.isContentEditable ?? false);
      if (!isDrawer && e.key === "Escape") {
        if (document.querySelector('[role="dialog"]')) return;
        e.preventDefault();
        router.push("/bookings");
        return;
      }
      if (editing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowLeft" && previousUid) {
        e.preventDefault();
        router.push(`/bookings/${previousUid}`);
      } else if (e.key === "ArrowRight" && nextUid) {
        e.preventDefault();
        router.push(`/bookings/${nextUid}`);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, previousUid, nextUid, isDrawer]);

  const cancel = useCancelBooking({
    onSuccess: () => router.push("/bookings"),
  });

  if (!data) {
    const loadingBody = (
      <>
        <BrutalistPageHeader title={t("title")} />
        <p className="mt-8 text-[13px] opacity-55">{t("loading")}</p>
      </>
    );
    return isDrawer ? (
      <div className="flex flex-col gap-2 p-5 sm:p-6">{loadingBody}</div>
    ) : (
      <BrutalistPageShell tight>{loadingBody}</BrutalistPageShell>
    );
  }

  const slotStart = new Date(data.slotStart as unknown as string);
  const slotEnd = new Date(data.slotEnd as unknown as string);
  const cancelled = data.deleted;
  const rescheduled = data.rescheduledFromUid !== null;
  const status = cancelled ? "cancelled" : rescheduled ? "rescheduled" : "confirmed";

  const body = (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        {isDrawer ? (
          <span aria-hidden />
        ) : (
          <Link
            href="/bookings"
            className="bru-eyebrow inline-flex items-center gap-1.5 opacity-55 transition-opacity hover:opacity-100"
          >
            <ArrowLeftIcon className="size-3" aria-hidden />
            {t("back")}
          </Link>
        )}
        <div className="flex items-center gap-1.5">
          <NeighbourLink
            uid={data.previousUid}
            direction="previous"
            label={t("previousBooking")}
          />
          <NeighbourLink
            uid={data.nextUid}
            direction="next"
            label={t("nextBooking")}
          />
        </div>
      </div>

      <BrutalistPageHeader
        title={data.visitorName}
        aside={<StatusPill status={status} />}
      />
      <p className="bru-eyebrow tabular-nums mt-2">
        {fmtDate(slotStart)} {fmtTime(slotStart)} — {fmtTime(slotEnd)}
      </p>

      <div
        role="tablist"
        aria-label={t("tabsLabel")}
        className="mt-8 inline-flex overflow-hidden rounded-(--bru-r-sm) border-2 border-bru-line-strong"
      >
        <SegButton active={tab === "info"} onClick={() => setTab("info")}>
          {t("tabInfo")}
        </SegButton>
        <SegButton active={tab === "history"} onClick={() => setTab("history")}>
          {t("tabHistory")}
          {data.audit.length > 0 ? (
            <span
              className={[
                "tabular-nums text-[11px] font-bold leading-none",
                tab === "history" ? "opacity-65" : "opacity-45",
              ].join(" ")}
            >
              {data.audit.length}
            </span>
          ) : null}
        </SegButton>
      </div>

      <div className="mt-8 flex flex-col gap-10">
        {tab === "info" ? (
          <InfoView data={data} slotStart={slotStart} slotEnd={slotEnd} />
        ) : (
          <HistoryView audit={data.audit} />
        )}
      </div>

      {!cancelled ? (
        isDrawer ? (
          <div className="mt-8 flex gap-2 border-t-2 border-bru-line pt-5">
            <ConfirmDialog
              title={t("cancelTitle")}
              description={t("cancelDescription", { name: data.visitorName })}
              confirmLabel={t("cancelConfirm")}
              pendingLabel={t("cancelling")}
              cancelLabel={t("cancelCancel")}
              pending={cancel.isPending}
              onConfirm={async () => {
                await cancel.mutateAsync({ publicUid });
              }}
              trigger={
                <Button
                  type="button"
                  variant="brutalistGhost"
                  size="brutalist"
                  className="flex-1"
                  disabled={cancel.isPending}
                >
                  {cancel.isPending ? t("cancelling") : t("cancelAction")}
                </Button>
              }
            />
          </div>
        ) : (
          <>
            <div className="bru-dash-save-spacer" aria-hidden />
            <div className="bru-dash-save-bar" role="region" aria-label={t("actionsLabel")}>
              <div className="bru-dash-save-bar-inner flex gap-2">
                <ConfirmDialog
                  title={t("cancelTitle")}
                  description={t("cancelDescription", { name: data.visitorName })}
                  confirmLabel={t("cancelConfirm")}
                  pendingLabel={t("cancelling")}
                  cancelLabel={t("cancelCancel")}
                  pending={cancel.isPending}
                  onConfirm={async () => {
                    await cancel.mutateAsync({ publicUid });
                  }}
                  trigger={
                    <Button
                      type="button"
                      variant="brutalistGhost"
                      size="brutalist"
                      className="flex-1"
                      disabled={cancel.isPending}
                    >
                      {cancel.isPending ? t("cancelling") : t("cancelAction")}
                    </Button>
                  }
                />
              </div>
            </div>
          </>
        )
      ) : null}
    </>
  );

  return isDrawer ? (
    <div className="flex flex-col p-5 sm:p-6">{body}</div>
  ) : (
    <BrutalistPageShell tight>{body}</BrutalistPageShell>
  );
}

function NeighbourLink({
  uid,
  direction,
  label,
}: {
  uid: string | null;
  direction: "previous" | "next";
  label: string;
}) {
  const Icon = direction === "previous" ? ChevronLeftIcon : ChevronRightIcon;
  const baseClass =
    "inline-flex size-7 items-center justify-center rounded-(--bru-r-xs) transition-opacity";
  if (!uid) {
    return (
      <span
        aria-hidden
        className={`${baseClass} pointer-events-none opacity-25`}
      >
        <Icon className="size-3.5" strokeWidth={1.75} />
      </span>
    );
  }
  return (
    <Link
      href={`/bookings/${uid}`}
      aria-label={label}
      className={`${baseClass} opacity-55 hover:bg-[var(--bru-tint-hover)] hover:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--bru-ink)] focus-visible:outline-offset-2`}
    >
      <Icon className="size-3.5" strokeWidth={1.75} />
    </Link>
  );
}

function StatusPill({ status }: { status: "confirmed" | "cancelled" | "rescheduled" }) {
  const t = useTranslations("BookingDetail");
  const dotClass =
    status === "confirmed"
      ? "bg-emerald-600 dark:bg-emerald-400"
      : status === "rescheduled"
        ? "bg-amber-500"
        : "bg-bru-line-strong";
  return (
    <span className="bru-eyebrow inline-flex items-center gap-1.5">
      <span className={["size-1.5 rounded-full", dotClass].join(" ")} aria-hidden />
      {t(`status_${status}`)}
    </span>
  );
}

function SegButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={[
        "inline-flex items-center gap-2.5 px-4 py-2.5",
        "font-[family-name:var(--bru-mono)] text-[11px] font-extrabold tracking-[2px] uppercase",
        "transition-colors duration-150 ease-bru",
        "border-r-2 border-bru-line-strong last:border-r-0",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bru-line-strong focus-visible:ring-inset",
        active
          ? "bg-bru-content text-bru-bg"
          : "bg-bru-bg text-bru-content hover:bg-bru-tint",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

type DetailData = {
  id: number;
  publicUid: string;
  hostId: string;
  workspaceId: string;
  eventTypeId: string | null;
  visitorName: string;
  visitorEmail: string;
  visitorTimezone: string | null;
  question: string | null;
  slotStart: string | Date;
  slotEnd: string | Date;
  referrer: string | null;
  rescheduledFromUid: string | null;
  createdAt: string | Date;
  deleted: boolean;
  deletedAt: string | Date | null;
  host: {
    id: string;
    name: string | null;
    handle: string | null;
    email: string;
    timezone: string;
  } | null;
  eventType: {
    id: string;
    slug: string;
    name: string;
    durationMins: number;
  } | null;
  audit: ReadonlyArray<{
    id: number;
    actor: string;
    action: string;
    operationId: string;
    createdAt: string | Date;
  }>;
  pendingTasks: ReadonlyArray<{
    id: number;
    type: string;
    referenceUid: string | null;
    scheduledAt: string | Date | null;
    attempts: number;
    lastError: string | null;
  }>;
  deliveries: ReadonlyArray<{
    id: number;
    type: string;
    referenceUid: string | null;
    scheduledAt: string | Date | null;
    succeededAt: string | Date | null;
    attempts: number;
  }>;
  rescheduledFrom: {
    publicUid: string;
    slotStart: string | Date;
  } | null;
  previousUid: string | null;
  nextUid: string | null;
};

function InfoView({
  data,
  slotStart,
  slotEnd,
}: {
  data: DetailData;
  slotStart: Date;
  slotEnd: Date;
}) {
  const t = useTranslations("BookingDetail");
  const visitorTz = data.visitorTimezone ?? null;
  const hostTz = data.host?.timezone ?? "UTC";
  const showTimezones = visitorTz !== null && visitorTz !== hostTz;

  return (
    <>
      <BrutalistSection title={t("when")}>
        <div className="flex flex-col gap-2">
          <p className="text-[15px] font-bold tabular-nums">
            {fmtDate(slotStart)} {fmtTime(slotStart)} — {fmtTime(slotEnd)}
          </p>
          {showTimezones ? (
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="bru-eyebrow tabular-nums opacity-55">
                {t("hostTimezone", { tz: hostTz })}
              </span>
              <span className="bru-eyebrow tabular-nums opacity-55">
                {t("visitorTimezone", { tz: visitorTz })}
              </span>
            </div>
          ) : null}
        </div>
      </BrutalistSection>

      <BrutalistSection title={t("who")}>
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-[14px] font-bold">{data.visitorName}</p>
            <p className="bru-eyebrow inline-flex items-center gap-1.5 mt-1.5 opacity-55">
              <MailIcon className="size-3" aria-hidden />
              {data.visitorEmail}
            </p>
          </div>
          {data.host ? (
            <div className="border-t-2 border-bru-line pt-3">
              <p className="bru-eyebrow opacity-55 mb-1.5">{t("hostLabel")}</p>
              <p className="text-[14px] font-bold">
                {data.host.name ?? data.host.handle ?? data.host.email}
              </p>
            </div>
          ) : null}
        </div>
      </BrutalistSection>

      {data.question ? (
        <BrutalistSection title={t("question")}>
          <p className="text-[14px] leading-[1.55] opacity-85">
            &ldquo;{data.question}&rdquo;
          </p>
        </BrutalistSection>
      ) : null}

      {(data.eventType !== null || data.referrer !== null) ? (
        <BrutalistSection title={t("source")}>
          <div className="flex flex-col gap-3">
            {data.eventType ? (
              <div className="flex items-baseline justify-between gap-x-4">
                <span className="bru-eyebrow opacity-55">{t("eventTypeLabel")}</span>
                <span className="text-[13px] tabular-nums font-bold">
                  {data.eventType.name}{" "}
                  <span className="opacity-55">/{data.eventType.slug}</span>{" "}
                  <span className="opacity-55">{data.eventType.durationMins}m</span>
                </span>
              </div>
            ) : null}
            {data.referrer ? (
              <div className="flex items-baseline justify-between gap-x-4">
                <span className="bru-eyebrow opacity-55">{t("referrerLabel")}</span>
                <span className="bru-eyebrow tabular-nums">{data.referrer}</span>
              </div>
            ) : null}
          </div>
        </BrutalistSection>
      ) : null}

      {data.pendingTasks.length > 0 ? (
        <BrutalistSection title={t("scheduled")}>
          <ul role="list" className="flex flex-col gap-2">
            {data.pendingTasks.map((task) => (
              <li
                key={task.id}
                className="flex items-baseline justify-between gap-x-4 text-[13px]"
              >
                <span className="bru-eyebrow opacity-55">{taskLabel(task.referenceUid ?? "")}</span>
                <span className="tabular-nums opacity-75">
                  {task.scheduledAt
                    ? fmtAuditTimestamp(new Date(task.scheduledAt as unknown as string))
                    : t("unscheduled")}
                </span>
              </li>
            ))}
          </ul>
        </BrutalistSection>
      ) : null}

      {data.deliveries.length > 0 ? (
        <BrutalistSection title={t("delivered")}>
          <ul role="list" className="flex flex-col gap-2">
            {data.deliveries.map((delivery) => (
              <li
                key={delivery.id}
                className="flex items-baseline justify-between gap-x-4 text-[13px]"
              >
                <span className="bru-eyebrow inline-flex items-center gap-1.5 opacity-55">
                  {taskLabel(delivery.referenceUid ?? "")}
                  {delivery.attempts > 1 ? (
                    <span
                      className="bru-eyebrow tabular-nums opacity-75"
                      aria-label={t("retriedAttempts", {
                        count: delivery.attempts,
                      })}
                    >
                      ×{delivery.attempts}
                    </span>
                  ) : null}
                </span>
                <span className="tabular-nums opacity-75">
                  {delivery.succeededAt
                    ? fmtAuditTimestamp(
                        new Date(delivery.succeededAt as unknown as string),
                      )
                    : null}
                </span>
              </li>
            ))}
          </ul>
        </BrutalistSection>
      ) : null}

      {data.rescheduledFrom ? (
        <BrutalistSection title={t("rescheduledFrom")}>
          <Link
            href={`/bookings/${data.rescheduledFrom.publicUid}`}
            className="bru-eyebrow tabular-nums underline underline-offset-2 opacity-75 hover:opacity-100"
          >
            {fmtAuditTimestamp(
              new Date(data.rescheduledFrom.slotStart as unknown as string),
            )}
          </Link>
        </BrutalistSection>
      ) : null}
    </>
  );
}

function taskLabel(referenceUid: string): string {
  if (referenceUid.includes(":email:booking-reminder")) return "REMINDER EMAIL";
  if (referenceUid.includes(":workflow:")) return "WORKFLOW";
  if (referenceUid.includes(":booking.")) return "WEBHOOK";
  if (referenceUid.includes(":email:")) return "EMAIL";
  return "TASK";
}

function HistoryView({
  audit,
}: {
  audit: DetailData["audit"];
}) {
  const t = useTranslations("BookingDetail");
  if (audit.length === 0) {
    return <BrutalistInlineEmpty>{t("historyEmpty")}</BrutalistInlineEmpty>;
  }
  return (
    <BrutalistSection title={t("timeline")}>
      <ul role="list" className="flex flex-col gap-4">
        {audit.map((row) => {
          const at = new Date(row.createdAt as unknown as string);
          return (
            <li
              key={row.id}
              className="grid grid-cols-[16px_minmax(0,1fr)] gap-x-3"
            >
              <div className="relative flex justify-center pt-1">
                <span
                  className="size-2 rounded-full bg-bru-line-strong"
                  aria-hidden
                />
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="text-[13px] font-bold uppercase tracking-[1.5px]">
                    {row.action.toLowerCase()}
                  </span>
                  <span className="bru-eyebrow tabular-nums opacity-55">
                    {fmtAuditTimestamp(at)}
                  </span>
                </div>
                <span className="bru-eyebrow opacity-55">
                  {row.actor.toLowerCase()}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </BrutalistSection>
  );
}
