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
import { OhInlineEmpty } from "@/components/oh/inline-empty";
import { OhPageHeader } from "@/components/oh/page-header";
import { OhPageShell } from "@/components/oh/page-shell";
import { OhSection } from "@/components/oh/section";
import { ConfirmDialog } from "@/components/oh/confirm-dialog";

// Host-side booking detail. Layout pattern stolen from cal.com's
// BookingDetailsSheet but rendered as a full page (drawer / intercepted
// route is a future iteration — see chisel research note in commit
// message). Sections compose via <OhSection /> for consistent
// label/content rhythm.
//
// Two tabs (info/history) — same segmented control as cal.com's
// info-vs-audit toggle. Hides the audit log behind a tab so the
// primary surface stays focused on "what's this booking?" instead
// of "what's happened to it?".
//
// Keyboard shortcuts: ESC → back to /bookings.

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
  // "page" — standalone full-page route at /bookings/[publicUid].
  // "drawer" — rendered inside a Sheet by the intercepted parallel
  //            route at @modal/(.)bookings/[publicUid]. The drawer
  //            owns its own close button + ESC handler (Sheet
  //            primitive) and the page shell + back-link are
  //            suppressed.
  variant?: "page" | "drawer";
}) {
  const router = useRouter();
  const t = useTranslations("BookingDetail");
  const { data } = trpc.bookings.getDetail.useQuery({ publicUid });
  const [tab, setTab] = useState<Tab>("info");
  const isDrawer = variant === "drawer";

  // Keyboard shortcuts (cal.com pattern). Page variant: ESC → back
  // to /bookings (router.push). Drawer variant: Sheet's own close
  // handler intercepts ESC, so we only wire ←/→ here. ←/→ navigate
  // to the adjacent booking in slotStart order if one exists. Skip
  // when an editable element has focus so the visitor's `<input>`
  // arrow-key cursor movement isn't hijacked.
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
        // Suppress when the intercepted-route Sheet (A7) is layered
        // on top of this page render. The Sheet primitive owns ESC
        // in that scenario; firing router.push("/bookings") here in
        // parallel would race router.back() and pop history twice.
        // `[role="dialog"]` matches the Base UI Sheet's popup
        // container — present only while the drawer is mounted.
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
        <OhPageHeader title={t("title")} />
        <p className="mt-8 text-[13px] opacity-55">{t("loading")}</p>
      </>
    );
    return isDrawer ? (
      <div className="flex flex-col gap-2 p-5 sm:p-6">{loadingBody}</div>
    ) : (
      <OhPageShell tight>{loadingBody}</OhPageShell>
    );
  }

  const slotStart = new Date(data.slotStart as unknown as string);
  const slotEnd = new Date(data.slotEnd as unknown as string);
  const cancelled = data.deleted;
  const rescheduled = data.rescheduledFromUid !== null;
  const status = cancelled ? "cancelled" : rescheduled ? "rescheduled" : "confirmed";

  // Outer wrapper: OhPageShell on the dedicated page route,
  // a plain padded div inside the Sheet drawer (the Sheet primitive
  // owns the visual frame). Inner content is identical in both
  // variants — built once and slotted into either wrapper to avoid
  // the React 19 lint rule against component construction in render.
  const body = (
    <>
      {/* Back nav + adjacent prev/next chevrons (A5). The chevrons
          mirror cal.com's BookingDetailsSheet keyboard cluster and
          link to the host's previous/next booking in slotStart
          order. Disabled when there is no neighbour on that side —
          rendered as a ghost-style div so the row doesn't reflow
          on the first / last booking. ←/→ keys also navigate
          (effect above). The drawer variant suppresses the back
          link (the Sheet has its own X close affordance) but keeps
          the prev/next chevrons aligned to the leading edge so the
          host can keep triaging without a round-trip to the list. */}
      <div className="mb-4 flex items-center justify-between gap-3">
        {isDrawer ? (
          <span aria-hidden />
        ) : (
          <Link
            href="/bookings"
            className="oh-eyebrow inline-flex items-center gap-1.5 opacity-55 transition-opacity hover:opacity-100"
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

      {/* Hero — visitor name as title, slot eyebrow above, status pill */}
      <OhPageHeader
        title={data.visitorName}
        aside={<StatusPill status={status} />}
      />
      <p className="oh-eyebrow tabular-nums mt-2">
        {fmtDate(slotStart)} {fmtTime(slotStart)} — {fmtTime(slotEnd)}
      </p>

      {/* Segmented control — info / history. Cal.com's pattern. */}
      <div
        role="tablist"
        aria-label={t("tabsLabel")}
        className="mt-8 inline-flex overflow-hidden rounded-(--oh-r-sm) border-2 border-oh-line-strong"
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

      {/* Footer actions. Page variant: sticky at viewport bottom
          (.oh-dash-save-bar is position:fixed). Drawer variant:
          inline at the bottom of the Sheet content — the Sheet
          itself is a position:fixed container so an additional
          fixed bar would float outside the drawer. */}
      {!cancelled ? (
        isDrawer ? (
          <div className="mt-8 flex gap-2">
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
                  variant="ohGhost"
                  size="oh"
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
            <div className="oh-dash-save-spacer" aria-hidden />
            <div className="oh-dash-save-bar" role="region" aria-label={t("actionsLabel")}>
              <div className="oh-dash-save-bar-inner flex gap-2">
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
                      variant="ohGhost"
                      size="oh"
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
    <OhPageShell tight>{body}</OhPageShell>
  );
}

// Adjacent booking link (A5). Active state is a Link; inactive is
// a span with the same dimensions so the row doesn't reflow on the
// first / last booking. The icon-only chevron is sized to match the
// back-arrow (`size-3`) for visual rhythm with the row's leading
// element.
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
      className={`${baseClass} opacity-55 hover:bg-[var(--oh-tint-hover)] hover:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--oh-ink)] focus-visible:outline-offset-2`}
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
        "font-[family-name:var(--oh-mono)] text-[11px] font-extrabold tracking-[2px] uppercase",
        "transition-colors duration-150 ease-oh",
        "border-r-2 border-oh-line-strong last:border-r-0",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-oh-line-strong focus-visible:ring-inset",
        active
          ? "bg-oh-content text-oh-bg"
          : "bg-oh-bg text-oh-content hover:bg-oh-tint",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

// Procedure output shape, written out by hand so we don't pay the
// tRPC v11 inferRouterOutputs<AppRouter> type-instantiation cost (it
// traverses the full router and trips a "type instantiation is
// excessively deep" warning on this codebase). Mirrors the
// `bookings.getDetail` select shape exactly — keep in sync if the
// procedure's select changes.
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
  const visitorTz = data.visitorTimezone ?? null;
  const hostTz = data.host?.timezone ?? "UTC";
  const showTimezones = visitorTz !== null && visitorTz !== hostTz;

  return (
    <>
      <OhSection title={t("when")}>
        <div className="flex flex-col gap-2">
          <p className="text-[15px] font-bold tabular-nums">
            {fmtDate(slotStart)} {fmtTime(slotStart)} — {fmtTime(slotEnd)}
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
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-[14px] font-bold">{data.visitorName}</p>
            <p className="oh-eyebrow inline-flex items-center gap-1.5 mt-1.5 opacity-55">
              <MailIcon className="size-3" aria-hidden />
              {data.visitorEmail}
            </p>
          </div>
          {data.host ? (
            <div className="border-t-2 border-oh-line pt-3">
              <p className="oh-eyebrow opacity-55 mb-1.5">{t("hostLabel")}</p>
              <p className="text-[14px] font-bold">
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
        // Split pendingTasks into "still retrying" and "permanently
        // failed" client-side (B.PT77). Cron stops re-running rows
        // where `attempts >= maxAttempts`, so the equality flip is
        // the host-visible "this delivery is dead" signal. Splitting
        // here avoids a second DB query on the detail load.
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
                      className="flex items-baseline justify-between gap-x-4 text-[13px]"
                    >
                      <span className="oh-eyebrow inline-flex items-center gap-1.5 opacity-55">
                        <span aria-hidden className="text-[color:var(--oh-content-muted)]">
                          ⟳
                        </span>
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
                      className="flex flex-col gap-1 text-[13px]"
                    >
                      <div className="flex items-baseline justify-between gap-x-4">
                        <span className="oh-eyebrow inline-flex items-center gap-1.5 text-[color:var(--destructive)]">
                          <span aria-hidden>✗</span>
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
                              className="font-[family-name:var(--oh-mono)] text-[11px] font-extrabold tabular-nums"
                              aria-label={`HTTP ${task.lastResponseStatus}`}
                            >
                              {task.lastResponseStatus}
                            </span>
                          ) : null}
                          {t("failedStatus")}
                        </span>
                      </div>
                      {task.lastError ? (
                        <p className="font-[family-name:var(--oh-mono)] text-[12px] leading-[1.5] opacity-65 line-clamp-3">
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
                className="flex items-baseline justify-between gap-x-4 text-[13px]"
              >
                <span className="oh-eyebrow inline-flex items-center gap-1.5 opacity-55">
                  <span
                    aria-hidden
                    className="text-[color:var(--oh-success,emerald-600)]"
                    style={{ color: "rgb(5 150 105)" }}
                  >
                    ✓
                  </span>
                  {taskLabel(delivery.referenceUid ?? "")}
                  {delivery.lastResponseStatus !== null ? (
                    <span
                      className="font-[family-name:var(--oh-mono)] text-[11px] font-extrabold tabular-nums"
                      style={{ color: "rgb(5 150 105)" }}
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

// Detect what a Task referenceUid is for so the label tells the host
// what's pending. Format is colon-separated; the suffix is the human
// signal. Examples:
//   <uid>:email:booking-reminder:visitor    → "REMINDER EMAIL"
//   <uid>:workflow:<id>:<operationId>       → "WORKFLOW"
//   <uid>:booking.cancelled:<subId>         → "WEBHOOK"
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
