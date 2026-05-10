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
  RefreshCw,
  Trash2,
} from "lucide-react";
import { Menu } from "@base-ui/react/menu";
import { trpc } from "@/trpc/hooks";
import { useCancelBooking } from "@/lib/mutations/use-cancel-booking";
import { OhInlineEmpty } from "@/components/oh/inline-empty";
import { OhPageHeader } from "@/components/oh/page-header";
import { OhPageShell } from "@/components/oh/page-shell";
import { OhSection } from "@/components/oh/section";
import { ConfirmDialog } from "@/components/oh/confirm-dialog";
import { cn } from "@/lib/utils";

// Host-side booking detail. Refactored 2026-05-09 (B.PT293) to
// match the rest of the app's chrome + UX vocabulary:
//
//   - Brutalist `border-2 border-oh-line-strong` segmented tabs →
//     depth-card-styled tab strip (paper bg + shadow-resting on
//     active, opacity-55 on inactive). Same vocabulary as the new
//     WorkspaceDetailNav.
//   - Unicode status glyphs (✓ ✗ ⟳) → lucide icons (`Check`,
//     `AlertTriangle`, `RefreshCw`) for consistency with the rest
//     of the app's icon vocabulary.
//   - Sticky `oh-dash-save-bar` cancel action → `⋯ Menu` in the
//     header strip (per `dashboard-forms.md`: the position-fixed
//     save bar pattern was retired 2026-04-29 in favor of inline
//     actions; here cancel becomes a one-shot action behind the
//     compact ⋯ trigger so it doesn't compete with the
//     informational sections).
//   - Inline `font-[family-name:var(--oh-mono)] text-[Npx]
//     font-extrabold tracking-[Npx] uppercase` strings →
//     `oh-eyebrow` utility (single source of truth per `oh-ui.md`).
//   - `border-t-2 border-oh-line pt-3` dividers between visitor
//     and host inside the WHO section → flex `gap-3` rhythm.
//   - `min-w-0` chain on truncated children for mobile shrinking
//     (same pattern as the developer-cards mobile fix).
//
// Cal.com-inspired adds: `mailto:` link on the visitor email row
// so the host can reach out directly. Cancellation reason input
// (cal.com's pattern) is deferred to a future commit — would
// need a `cancelReason` schema add on `bookings.cancel`.
//
// Two tabs (info/history) — same segmented control as cal.com's
// info-vs-audit toggle. Hides the audit log behind a tab so the
// primary surface stays focused on "what's this booking?" instead
// of "what's happened to it?".
//
// Keyboard shortcuts: ESC → back to /bookings (page variant).
// ←/→ → adjacent booking (both variants).

type Tab = "info" | "history";

// B.PT26 — `fmtDate` lifted out; date labels resolve via next-intl's
// `useFormatter()` inside the component so locale honors the user's
// `oh_locale` cookie (en/es). `fmtTime` stays — 24h format is locale-
// independent for the audit log + slot eyebrow read.
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
  // "page"  — standalone full-page route at /bookings/[publicUid]
  //           (direct URL / hard refresh). Page shell + back link.
  // "modal" — rendered inside a ResponsiveModal opened from the
  //           bookings list. Modal owns close + ESC via the
  //           primitive; back link + sticky save bar suppressed.
  variant?: "page" | "modal";
  // Modal variant only. When set, prev/next chevrons + ←/→ keys
  // call this with the adjacent uid instead of navigating, so the
  // modal stays open and just swaps content.
  onNavigate?: (uid: string) => void;
  // Modal variant only. Called after a successful cancel (modal
  // closes itself instead of navigating to /bookings).
  onClose?: () => void;
}) {
  const router = useRouter();
  const t = useTranslations("BookingDetail");
  // B.PT26 — locale-aware date label for the drawer/page hero
  // eyebrow. The ICU shape `month: "short", day: "numeric", year:
  // "numeric"` produces "Jan 15, 2026" / "15 ene 2026"; oh-eyebrow's
  // CSS uppercase preserves the prior visual rhythm. Same hook
  // recurs in InfoView + HistoryView for their own surfaces.
  const format = useFormatter();
  const fmtSlotDate = (d: Date) =>
    format.dateTime(d, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  const { data } = trpc.bookings.getDetail.useQuery({ publicUid });
  const [tab, setTab] = useState<Tab>("info");
  const isModal = variant === "modal";

  // Keyboard shortcuts (cal.com pattern). Page variant: ESC → back
  // to /bookings (router.push). Modal variant: ResponsiveModal owns
  // ESC via the primitive — only wire ←/→ here. ←/→ navigate to the
  // adjacent booking in slotStart order if one exists. In modal mode
  // the navigation happens via `onNavigate` (parent swaps the
  // selected uid in place); page mode pushes the URL. Skip when an
  // editable element has focus so the visitor's `<input>` arrow-key
  // cursor movement isn't hijacked.
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
    // navigateTo is stable across renders for the keys it depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, previousUid, nextUid, isModal, onNavigate]);

  const cancel = useCancelBooking({
    onSuccess: () => {
      if (onClose) onClose();
      else router.push("/bookings");
    },
  });

  if (!data) {
    const loadingBody = (
      <>
        <OhPageHeader title={t("title")} />
        <p className="mt-8 text-[13px] opacity-55">{t("loading")}</p>
      </>
    );
    return isModal ? (
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
      {/* Top action row — back link (page variant) + prev/next
          chevrons + ⋯ Menu containing destructive actions. The
          chevrons mirror cal.com's BookingDetailsSheet keyboard
          cluster (←/→ keys also navigate via the effect above).
          Modal variant suppresses the back link (the modal has its
          own close affordance) but keeps the rest aligned. */}
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
            uid={data.previousUid}
            direction="previous"
            label={t("previousBooking")}
            onNavigate={onNavigate}
          />
          <NeighbourLink
            uid={data.nextUid}
            direction="next"
            label={t("nextBooking")}
            onNavigate={onNavigate}
          />
          {!cancelled ? (
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
        </div>
      </div>

      {/* Hero — visitor name as title + status pill aside. Slot
          eyebrow sits below the rule, paired with the host/visitor
          timezone row when they differ. `min-w-0` on the page
          header so long visitor names truncate cleanly on mobile. */}
      <OhPageHeader
        title={data.visitorName}
        aside={<StatusPill status={status} />}
      />
      <p className="oh-eyebrow mt-2 tabular-nums">
        {fmtSlotDate(slotStart)} {fmtTime(slotStart)} — {fmtTime(slotEnd)}
      </p>

      {/* Tab strip — depth-card vocabulary. Active tab carries the
          paper-bg + shadow-resting lift the rest of the app uses
          for selected pills (sidebar nav, OhPillSwitcher, theme
          card). Non-active tabs read as muted opacity-55 with a
          tint hover. Replaces the prior brutalist `border-2
          border-oh-line-strong` segmented inverse-fill control. */}
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
          {data.audit.length > 0 ? (
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
        {tab === "info" ? (
          <InfoView data={data} slotStart={slotStart} slotEnd={slotEnd} />
        ) : (
          <HistoryView audit={data.audit} />
        )}
      </div>
      {/* Cancel action moved to the header's ⋯ menu (BookingActionsMenu
          above). The prior shape was a `oh-dash-save-bar` sticky at
          viewport bottom on the page route — that pattern was retired
          2026-04-29 per `dashboard-forms.md`. The cancel action is
          one-shot destructive, not a frequent affordance — surfacing
          it inline at the bottom AND a position-fixed island read as
          alarmist. The ⋯ trigger keeps it findable but unobtrusive. */}
    </>
  );

  return isModal ? (
    <div className="flex flex-col p-5 sm:p-6">{body}</div>
  ) : (
    <OhPageShell tight>{body}</OhPageShell>
  );
}

// Adjacent booking link (A5). Active state is a Link; inactive is
// a span with the same dimensions so the row doesn't reflow on the
// first / last booking. The icon-only chevron is sized to match the
// back-arrow (`size-3`) for visual rhythm with the row's leading
// element. When `onNavigate` is supplied (modal variant), plain
// clicks call it instead of navigating — the modal stays open and
// just swaps content. Cmd/middle-click still hit the `<Link>` href
// so power users can open the standalone page in a new tab.
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

// Tab strip button — depth-card vocabulary. Active tab pins
// `--oh-shadow-resting` + paper bg + bold; inactive tab reads as
// muted opacity-55 with a tint hover. Same shape WorkspaceDetailNav
// + the sidebar nav active row + OhPillSwitcher's active pill use.
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

// Header actions menu — compact ⋯ trigger that opens a Base UI
// Menu with the destructive flow behind a controlled ConfirmDialog.
// Same vocabulary as members-panel's invitation-row actions menu:
// trash icon + verbal label inside a `oh-menu-popup`. Future
// reschedule + copy-link items slot in here.
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
  // B.PT26 — locale-aware slot eyebrow + audit timestamps. Formatter
  // is request-locale-bound via next-intl provider; the ICU shape
  // matches the prior MONTH_SHORT/WEEKDAY_SHORT verbatim once oh-
  // eyebrow's CSS uppercases. Lifted INTO each consuming sub-
  // component (InfoView, HistoryView) instead of passed as a prop —
  // hooks are cheap, prop-drilling formatters is noise.
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
            {/* mailto on the visitor email — cal.com inspiration.
                Lets the host reach out directly instead of copy-
                pasting the address. Hairline tertiary affordance,
                opacity-55 → 100 on hover. */}
            <a
              href={`mailto:${data.visitorEmail}`}
              className="oh-eyebrow oh-focus-ring mt-1.5 inline-flex min-w-0 items-center gap-1.5 rounded-(--oh-r-xs) opacity-55 transition-opacity duration-150 ease-oh hover:opacity-100"
            >
              <MailIcon className="size-3 shrink-0" aria-hidden />
              <span className="truncate">{data.visitorEmail}</span>
            </a>
          </div>
          {data.host ? (
            // Host row — no `border-t-2 border-oh-line pt-3`
            // divider (was a brutalist motif). Flex `gap-4` on
            // the parent provides the breathing room; the eyebrow
            // label visually separates the rows.
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
  // B.PT26 — see InfoView's note on the formatter hook. Same pattern
  // here for the timeline rows.
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
