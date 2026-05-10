"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import {
  AlertTriangle,
  ArrowLeftIcon,
  Check,
  ChevronLeftIcon,
  ChevronRightIcon,
  MailIcon,
  MoreHorizontal,
  X,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { Menu } from "@base-ui/react/menu";
import { keepPreviousData } from "@tanstack/react-query";
import { trpc } from "@/trpc/hooks";
import { useCancelBooking } from "@/lib/mutations/use-cancel-booking";
import { OhInlineEmpty } from "@/components/oh/inline-empty";
import { OhPageHeader } from "@/components/oh/page-header";
import { OhSection } from "@/components/oh/section";
import { ConfirmDialog } from "@/components/oh/confirm-dialog";
import { cn } from "@/lib/utils";

type Tab = "info" | "history";

function fmtTime(d: Date): string {
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export default function BookingDetail({
  publicUid,
  variant = "page",
  onNavigate,
  onClose,
}: {
  publicUid: string;
  variant?: "page" | "modal";
  onNavigate?: (uid: string) => void;
  onClose?: () => void;
}) {
  const router = useRouter();
  const t = useTranslations("BookingDetail");
  const format = useFormatter();
  const fmtSlotDate = (d: Date) =>
    format.dateTime(d, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  const utils = trpc.useUtils();
  const { data } = trpc.bookings.getDetail.useQuery(
    { publicUid },
    { placeholderData: keepPreviousData },
  );
  const [tab, setTab] = useState<Tab>("info");
  const isModal = variant === "modal";

  useEffect(() => {
    if (data?.previousUid) {
      utils.bookings.getDetail.prefetch({ publicUid: data.previousUid });
    }
    if (data?.nextUid) {
      utils.bookings.getDetail.prefetch({ publicUid: data.nextUid });
    }
  }, [data?.previousUid, data?.nextUid, utils]);

  const previousUid = data?.previousUid ?? null;
  const nextUid = data?.nextUid ?? null;
  const navigateTo = (uid: string) => {
    if (onNavigate) onNavigate(uid);
    else router.push(`/bookings/${uid}`);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const editing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target?.isContentEditable ?? false);
      if (!isModal && e.key === "Escape") {
        e.preventDefault();
        router.push("/bookings");
        return;
      }
      if (editing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowLeft" && previousUid) {
        e.preventDefault();
        navigateTo(previousUid);
      } else if (e.key === "ArrowRight" && nextUid) {
        e.preventDefault();
        navigateTo(nextUid);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, previousUid, nextUid, isModal, onNavigate]);

  const cancel = useCancelBooking({
    onSuccess: () => {
      if (onClose) onClose();
      else router.push("/bookings");
    },
  });

  const slotStart = data
    ? new Date(data.slotStart as unknown as string)
    : null;
  const slotEnd = data
    ? new Date(data.slotEnd as unknown as string)
    : null;
  const cancelled = data?.deleted ?? false;
  const rescheduled = data?.rescheduledFromUid != null;
  const status: "confirmed" | "cancelled" | "rescheduled" | null = data
    ? cancelled
      ? "cancelled"
      : rescheduled
        ? "rescheduled"
        : "confirmed"
    : null;

  const body = (
    <>
      <div className="mb-4 flex min-w-0 items-center justify-between gap-3">
        {isModal ? (
          <span aria-hidden />
        ) : (
          <Link
            href="/bookings"
            className="oh-eyebrow inline-flex min-w-0 items-center gap-1.5 opacity-55 transition-opacity hover:opacity-100"
          >
            <ArrowLeftIcon className="size-3 shrink-0" aria-hidden />
            <span className="truncate">{t("back")}</span>
          </Link>
        )}
        <div className="flex shrink-0 items-center gap-1.5">
          <NeighbourLink
            uid={data?.previousUid ?? null}
            direction="previous"
            label={t("previousBooking")}
            onNavigate={onNavigate}
          />
          <NeighbourLink
            uid={data?.nextUid ?? null}
            direction="next"
            label={t("nextBooking")}
            onNavigate={onNavigate}
          />
          {data && !cancelled ? (
            <BookingActionsMenu
              cancelLabel={t("cancelAction")}
              cancelTitle={t("cancelTitle")}
              cancelDescription={t("cancelDescription", {
                name: data.visitorName,
              })}
              cancelConfirm={t("cancelConfirm")}
              cancelPending={t("cancelling")}
              cancelCancel={t("cancelCancel")}
              actionsAria={t("actionsLabel")}
              isPending={cancel.isPending}
              onConfirm={async () => {
                await cancel.mutateAsync({ publicUid });
              }}
            />
          ) : null}
          {isModal && onClose ? (
            <button
              type="button"
              onClick={onClose}
              aria-label={t("close")}
              className="oh-focus-ring inline-flex size-7 items-center justify-center rounded-(--oh-r-xs) text-[color:var(--oh-content-muted)] transition-colors hover:bg-[var(--oh-tint)] hover:text-[var(--oh-ink)]"
            >
              <X className="size-3.5" strokeWidth={1.75} />
            </button>
          ) : null}
        </div>
      </div>

      <OhPageHeader
        title={data?.visitorName ?? " "}
        aside={status ? <StatusPill status={status} /> : null}
      />
      <p className="oh-eyebrow mt-2 tabular-nums">
        {slotStart && slotEnd
          ? `${fmtSlotDate(slotStart)} ${fmtTime(slotStart)} — ${fmtTime(slotEnd)}`
          : " "}
      </p>

      <nav
        role="tablist"
        aria-label={t("tabsLabel")}
        className="mt-8 flex gap-1"
      >
        <DetailTab
          active={tab === "info"}
          onClick={() => setTab("info")}
        >
          {t("tabInfo")}
        </DetailTab>
        <DetailTab
          active={tab === "history"}
          onClick={() => setTab("history")}
        >
          <span>{t("tabHistory")}</span>
          {data && data.audit.length > 0 ? (
            <span
              className={cn(
                "tabular-nums text-[11px] font-bold leading-none",
                tab === "history" ? "opacity-65" : "opacity-55",
              )}
            >
              {data.audit.length}
            </span>
          ) : null}
        </DetailTab>
      </nav>

      <div className="mt-8 flex flex-col gap-10">
        {data && slotStart && slotEnd ? (
          tab === "info" ? (
            <InfoView data={data} slotStart={slotStart} slotEnd={slotEnd} />
          ) : (
            <HistoryView audit={data.audit} />
          )
        ) : (
          <p className="text-[13px] opacity-55">{t("loading")}</p>
        )}
      </div>
    </>
  );

  const wrapperClass = isModal
    ? "flex flex-col px-4 pt-4 pb-10 sm:px-6"
    : "mx-auto w-full max-w-2xl px-4 pt-4 pb-10 sm:px-6";
  return <div className={wrapperClass}>{body}</div>;
}

function NeighbourLink({
  uid,
  direction,
  label,
  onNavigate,
}: {
  uid: string | null;
  direction: "previous" | "next";
  label: string;
  onNavigate?: (uid: string) => void;
}) {
  const Icon = direction === "previous" ? ChevronLeftIcon : ChevronRightIcon;
  const baseClass =
    "inline-flex size-7 items-center justify-center rounded-(--oh-r-xs) transition-opacity";
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
      onClick={
        onNavigate
          ? (e) => {
              if (
                e.defaultPrevented ||
                e.metaKey ||
                e.ctrlKey ||
                e.shiftKey ||
                e.altKey ||
                e.button !== 0
              ) {
                return;
              }
              e.preventDefault();
              onNavigate(uid);
            }
          : undefined
      }
      className={`${baseClass} oh-focus-ring opacity-55 hover:bg-[var(--oh-tint-hover)] hover:opacity-100`}
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
        : "bg-oh-line-strong";
  return (
    <span className="oh-eyebrow inline-flex items-center gap-1.5">
      <span className={["size-1.5 rounded-full", dotClass].join(" ")} aria-hidden />
      {t(`status_${status}`)}
    </span>
  );
}

function DetailTab({
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
      className={cn(
        "oh-eyebrow inline-flex items-center gap-2 rounded-(--oh-r-xs) px-3 py-1.5",
        "transition-[background-color,color,box-shadow,opacity] duration-150 ease-oh",
        "oh-focus-ring",
        active
          ? "bg-[color:var(--oh-paper)] opacity-100 shadow-[var(--oh-shadow-resting)]"
          : "opacity-55 hover:bg-[var(--oh-tint)] hover:opacity-100",
      )}
    >
      {children}
    </button>
  );
}

function BookingActionsMenu({
  cancelLabel,
  cancelTitle,
  cancelDescription,
  cancelConfirm,
  cancelPending,
  cancelCancel,
  actionsAria,
  isPending,
  onConfirm,
}: {
  cancelLabel: string;
  cancelTitle: string;
  cancelDescription: string;
  cancelConfirm: string;
  cancelPending: string;
  cancelCancel: string;
  actionsAria: string;
  isPending: boolean;
  onConfirm: () => Promise<void>;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  return (
    <>
      <Menu.Root>
        <Menu.Trigger
          className="oh-focus-ring inline-flex size-7 items-center justify-center rounded-(--oh-r-xs) opacity-55 transition-[opacity,background-color] duration-150 ease-oh hover:bg-[var(--oh-tint-hover)] hover:opacity-100 data-[popup-open]:bg-[var(--oh-tint-hover)] data-[popup-open]:opacity-100"
          aria-label={actionsAria}
        >
          <MoreHorizontal
            strokeWidth={1.75}
            className="size-3.5"
            aria-hidden
          />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner
            className="oh-menu-positioner"
            sideOffset={6}
            align="end"
            style={{ zIndex: 100 }}
          >
            <Menu.Popup className="oh-menu-popup">
              <Menu.Item
                className="oh-menu-item"
                disabled={isPending}
                onClick={() => setConfirmOpen(true)}
              >
                <span className="oh-menu-item-glyph">
                  <Trash2
                    aria-hidden
                    strokeWidth={1.75}
                    className="size-4"
                  />
                </span>
                <span>{cancelLabel}</span>
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={cancelTitle}
        description={cancelDescription}
        confirmLabel={cancelConfirm}
        pendingLabel={cancelPending}
        cancelLabel={cancelCancel}
        pending={isPending}
        onConfirm={onConfirm}
      />
    </>
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
    maxAttempts: number;
    lastError: string | null;
    lastResponseStatus: number | null;
  }>;
  deliveries: ReadonlyArray<{
    id: number;
    type: string;
    referenceUid: string | null;
    scheduledAt: string | Date | null;
    succeededAt: string | Date | null;
    attempts: number;
    lastResponseStatus: number | null;
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
  const format = useFormatter();
  const fmtSlotDate = (d: Date) =>
    format.dateTime(d, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  const fmtAuditTimestamp = (d: Date) =>
    `${format.dateTime(d, {
      month: "short",
      day: "numeric",
      year: "numeric",
    })} ${fmtTime(d)}`;
  const visitorTz = data.visitorTimezone ?? null;
  const hostTz = data.host?.timezone ?? "UTC";
  const showTimezones = visitorTz !== null && visitorTz !== hostTz;

  return (
    <>
      <OhSection title={t("when")}>
        <div className="flex flex-col gap-2">
          <p className="text-[15px] font-bold tabular-nums">
            {fmtSlotDate(slotStart)} {fmtTime(slotStart)} — {fmtTime(slotEnd)}
          </p>
          {showTimezones ? (
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="oh-eyebrow tabular-nums opacity-55">
                {t("hostTimezone", { tz: hostTz })}
              </span>
              <span className="oh-eyebrow tabular-nums opacity-55">
                {t("visitorTimezone", { tz: visitorTz })}
              </span>
            </div>
          ) : null}
        </div>
      </OhSection>

      <OhSection title={t("who")}>
        <div className="flex flex-col gap-4">
          <div className="min-w-0">
            <p className="truncate text-[14px] font-bold">
              {data.visitorName}
            </p>
            <a
              href={`mailto:${data.visitorEmail}`}
              className="oh-eyebrow oh-focus-ring mt-1.5 inline-flex min-w-0 items-center gap-1.5 rounded-(--oh-r-xs) opacity-55 transition-opacity duration-150 ease-oh hover:opacity-100"
            >
              <MailIcon className="size-3 shrink-0" aria-hidden />
              <span className="truncate">{data.visitorEmail}</span>
            </a>
          </div>
          {data.host ? (
            <div className="min-w-0">
              <p className="oh-eyebrow mb-1.5">{t("hostLabel")}</p>
              <p className="truncate text-[14px] font-bold">
                {data.host.name ?? data.host.handle ?? data.host.email}
              </p>
            </div>
          ) : null}
        </div>
      </OhSection>

      {data.question ? (
        <OhSection title={t("question")}>
          <p className="text-[14px] leading-[1.55] opacity-85">
            &ldquo;{data.question}&rdquo;
          </p>
        </OhSection>
      ) : null}

      {(data.eventType !== null || data.referrer !== null) ? (
        <OhSection title={t("source")}>
          <div className="flex flex-col gap-3">
            {data.eventType ? (
              <div className="flex items-baseline justify-between gap-x-4">
                <span className="oh-eyebrow opacity-55">{t("eventTypeLabel")}</span>
                <span className="text-[13px] tabular-nums font-bold">
                  {data.eventType.name}{" "}
                  <span className="opacity-55">/{data.eventType.slug}</span>{" "}
                  <span className="opacity-55">{data.eventType.durationMins}m</span>
                </span>
              </div>
            ) : null}
            {data.referrer ? (
              <div className="flex items-baseline justify-between gap-x-4">
                <span className="oh-eyebrow opacity-55">{t("referrerLabel")}</span>
                <span className="oh-eyebrow tabular-nums">{data.referrer}</span>
              </div>
            ) : null}
          </div>
        </OhSection>
      ) : null}

      {(() => {
        const failed = data.pendingTasks.filter(
          (t) => t.attempts >= t.maxAttempts,
        );
        const scheduled = data.pendingTasks.filter(
          (t) => t.attempts < t.maxAttempts,
        );
        return (
          <>
            {scheduled.length > 0 ? (
              <OhSection title={t("scheduled")}>
                <ul role="list" className="flex flex-col gap-2">
                  {scheduled.map((task) => (
                    <li
                      key={task.id}
                      className="flex min-w-0 items-baseline justify-between gap-x-4 text-[13px]"
                    >
                      <span className="oh-eyebrow inline-flex min-w-0 items-center gap-1.5">
                        <RefreshCw
                          aria-hidden
                          strokeWidth={1.75}
                          className="size-3 shrink-0 text-[color:var(--oh-content-muted)]"
                        />
                        {taskLabel(task.referenceUid ?? "")}
                        {task.attempts > 0 ? (
                          <span
                            className="tabular-nums opacity-75"
                            aria-label={t("retriedAttempts", {
                              count: task.attempts,
                            })}
                          >
                            ×{task.attempts}
                          </span>
                        ) : null}
                      </span>
                      <span className="tabular-nums opacity-75">
                        {task.scheduledAt
                          ? fmtAuditTimestamp(
                              new Date(task.scheduledAt as unknown as string),
                            )
                          : t("unscheduled")}
                      </span>
                    </li>
                  ))}
                </ul>
              </OhSection>
            ) : null}

            {failed.length > 0 ? (
              <OhSection title={t("failed")}>
                <ul role="list" className="flex flex-col gap-2">
                  {failed.map((task) => (
                    <li
                      key={task.id}
                      className="flex min-w-0 flex-col gap-1 text-[13px]"
                    >
                      <div className="flex min-w-0 items-baseline justify-between gap-x-4">
                        <span className="oh-eyebrow inline-flex min-w-0 items-center gap-1.5 text-[color:var(--destructive)]">
                          <AlertTriangle
                            aria-hidden
                            strokeWidth={1.75}
                            className="size-3 shrink-0"
                          />
                          {taskLabel(task.referenceUid ?? "")}
                          <span
                            className="tabular-nums opacity-75"
                            aria-label={t("retriedAttempts", {
                              count: task.attempts,
                            })}
                          >
                            ×{task.attempts}
                          </span>
                        </span>
                        <span className="oh-eyebrow inline-flex items-center gap-2 tabular-nums text-[color:var(--destructive)]">
                          {task.lastResponseStatus !== null ? (
                            <span
                              className="oh-eyebrow tabular-nums"
                              aria-label={`HTTP ${task.lastResponseStatus}`}
                            >
                              {task.lastResponseStatus}
                            </span>
                          ) : null}
                          {t("failedStatus")}
                        </span>
                      </div>
                      {task.lastError ? (
                        <p className="font-mono text-[12px] leading-[1.5] opacity-65 line-clamp-3">
                          {task.lastError}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </OhSection>
            ) : null}
          </>
        );
      })()}

      {data.deliveries.length > 0 ? (
        <OhSection title={t("delivered")}>
          <ul role="list" className="flex flex-col gap-2">
            {data.deliveries.map((delivery) => (
              <li
                key={delivery.id}
                className="flex min-w-0 items-baseline justify-between gap-x-4 text-[13px]"
              >
                <span className="oh-eyebrow inline-flex min-w-0 items-center gap-1.5">
                  <Check
                    aria-hidden
                    strokeWidth={2}
                    className="size-3 shrink-0 text-emerald-600 dark:text-emerald-400"
                  />
                  {taskLabel(delivery.referenceUid ?? "")}
                  {delivery.lastResponseStatus !== null ? (
                    <span
                      className="oh-eyebrow tabular-nums text-emerald-600 dark:text-emerald-400"
                      aria-label={`HTTP ${delivery.lastResponseStatus}`}
                    >
                      {delivery.lastResponseStatus}
                    </span>
                  ) : null}
                  {delivery.attempts > 1 ? (
                    <span
                      className="oh-eyebrow tabular-nums opacity-75"
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
        </OhSection>
      ) : null}

      {data.rescheduledFrom ? (
        <OhSection title={t("rescheduledFrom")}>
          <Link
            href={`/bookings/${data.rescheduledFrom.publicUid}`}
            className="oh-eyebrow tabular-nums underline underline-offset-2 opacity-75 hover:opacity-100"
          >
            {fmtAuditTimestamp(
              new Date(data.rescheduledFrom.slotStart as unknown as string),
            )}
          </Link>
        </OhSection>
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
  const format = useFormatter();
  const fmtAuditTimestamp = (d: Date) =>
    `${format.dateTime(d, {
      month: "short",
      day: "numeric",
      year: "numeric",
    })} ${fmtTime(d)}`;
  if (audit.length === 0) {
    return <OhInlineEmpty>{t("historyEmpty")}</OhInlineEmpty>;
  }
  return (
    <OhSection title={t("timeline")}>
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
                  className="size-2 rounded-full bg-oh-line-strong"
                  aria-hidden
                />
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="text-[13px] font-bold uppercase tracking-[1.5px]">
                    {row.action.toLowerCase()}
                  </span>
                  <span className="oh-eyebrow tabular-nums opacity-55">
                    {fmtAuditTimestamp(at)}
                  </span>
                </div>
                <span className="oh-eyebrow opacity-55">
                  {row.actor.toLowerCase()}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </OhSection>
  );
}
