"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  type ComponentProps,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { flushSync } from "react-dom";
import { usePathname } from "next/navigation";
import { useMounted } from "@/hooks/use-mounted";
import { useTranslations } from "next-intl";
import type { inferRouterOutputs } from "@trpc/server";
import { keepPreviousData } from "@tanstack/react-query";
import { trpc } from "@/trpc/hooks";
import type { AppRouter } from "@/trpc/router";
import { AnimatePresence, motion } from "motion/react";
import { OhVisitorShell } from "@/components/oh/oh-visitor-shell";
import {
  HANDLE_AVATAR_PROJECTION_STYLE,
  HandleHostAvatarBody,
} from "./handle-host-avatar";
import { isOpenSlot, toKey, type Slot } from "@/lib/availability";
import {
  getQueryParam,
  updateQueryParam,
  updateQueryParams,
} from "@/lib/url-params";
import { cn } from "@/lib/utils";
import { HandleModal } from "./handle-modal";
import {
  oStyle,
  useModalDebug,
  zStyle,
} from "../_components/visitor-debug-overlay";
import animSpec from "@/../docs/figma/anim-h-handle-redesign.json";
import { HandleMorphCard } from "./handle-morph-card";
import {
  FALLBACK_SLOT_OPTIONS,
  HANDLE_CARD_RADIUS_STYLE,
  HANDLE_SLOT_CONCENTRIC_OUTER_RADIUS,
  HANDLE_SLOT_LIST_RADIUS_STYLE,
  SlotRow,
  cornerRadiusStyle,
  minutesToSlotOption,
  type SlotOption,
} from "./handle-morph-parts";

// B.PT-instant — replaces the Figma-exported GENTLE_SPRING
// (`animSpec.transitions[0].spring`: mass=1, stiffness=247,
// damping=23.58, ~650ms visible motion) with a snappier physics
// curve that settles in ~250ms. The export was authored for a
// Figma prototype where there's no React reconciliation +
// shared-layout measurement overhead in front of the spring; in
// production those add ~30ms of pre-animation latency, making the
// gentle spring feel laggy on desktop (mobile masks it via
// faster touch-event timing). Stiffness 400 + damping 35 keeps
// the same critically-damped feel (no overshoot/bounce) at ~2.5x
// the visible speed.
//
// If you want the original Figma motion back, swap this constant
// for `animSpec.transitions[0].spring`.
const OPEN_SPRING = {
  mass: 1,
  stiffness: 400,
  damping: 35,
  velocity: 0,
} as const;
// B.PT179 — close spring is the dismissal SMART_ANIMATE from Figma
// (`handle-detail` → `handle`). The landing's transition needs this
// for the rollback animation; without it, motion picks up
// OPEN_SPRING on the entering-side (landing remount on modal close)
// and the close animation reuses the open spring's physics + ignores
// any debug-overlay duration override (B.PT178).
const CLOSE_SPRING =
  animSpec.transitions.find(
    (t) => t.from?.name === "handle-detail" && t.to?.name === "handle",
  )?.spring ?? animSpec.transitions[2].spring;

type RouterOutputs = inferRouterOutputs<AppRouter>;

type Props = {
  handle: string;
  initialUser: RouterOutputs["users"]["getByHandle"];
  initialSlots: RouterOutputs["schedule"]["getUpcomingSlots"];
  renderedAt: string;
  /** Server-resolved: true when the visiting session owns this
   *  handle. Drives the "Back to dashboard" link in the header.
   *  Optional + defaults to false so the embed/preview/playground
   *  surfaces that mount `<HostProfile>` don't have to thread the
   *  flag through. */
  isOwner?: boolean;
};

export default function HostProfile({
  handle,
  initialUser,
  initialSlots,
  renderedAt,
  isOwner = false,
}: Props) {
  const t = useTranslations("HostProfile");
  const pathname = usePathname();
  // B.PT167 / B.PT168 / B.PT170 — resolved animation config from the
  // route-level provider. Non-debug runtime receives the final
  // inspect-mode production target; dev `?debug=1` can override it.
  const { values: debugValues } = useModalDebug();
  const zL1 = debugValues?.zLayer1;
  const oL1 = debugValues?.oLayer1;
  // B.PT179 — landing's transition prop drives the morph on the
  // ENTERING side. When modal closes, motion picks up the entering
  // landing's transition for the rollback FLIP. Without these, the
  // landing was hardcoded to OPEN_SPRING for both directions and
  // any debug-overlay duration override applied only to the open
  // side.
  const openSpring = debugValues?.openSpring ?? OPEN_SPRING;
  const closeSpring = debugValues?.closeSpring ?? CLOSE_SPRING;
  // B.PT170 / B.PT171 / B.PT172 — `keepLandingMounted` strategy
  // revised again. B.PT171 had landing keep its layoutIds in this
  // mode; motion empirically picked the persistent landing as
  // "lead" so both elements rendered at LANDING's rect (not the
  // modal phantom's). User saw landing animate "back" to its origin
  // instead of frozen at destination. Final approach (B.PT172):
  //   - Strip landing's `layoutId`s when this toggle is on (no
  //     shared-element conflict; landing renders independently at
  //     its center-of-page natural position).
  //   - Render REAL chip content (SlotRow) inside the modal
  //     phantoms so the destinations aren't empty rects but show
  //     the chip at its 690×282 post-morph rect with full content
  //     (text + duration). See `handle-modal.tsx`.
  // Final production target keeps this TRUE: the landing card stays
  // mounted with layoutIds stripped while the modal owns the visible
  // destination content. Fallback false only applies if this component
  // is ever rendered outside the provider.
  const keepLandingMounted = debugValues?.keepLandingMounted ?? false;
  // B.PT175 — defer layoutId stripping by one render so motion has
  // a chance to measure the landing's source rects before they're
  // removed. Without this, an initial render with keepLandingMounted
  // = true means motion never sees the layoutIds → modal phantoms
  // mount with no source rect for `handle-card` / `oh-identity` /
  // `oh-slot-N` → fade-only entry instead of the spring morph. The
  // user discovered this empirically: toggling keepLandingMounted
  // OFF then back ON made the morph play, because the OFF state
  // briefly registered the landing's layoutIds with motion and
  // motion's per-layoutId rect cache persists even after the
  // element re-renders without that layoutId. `useMounted()` is
  // false on the first render (server + first client paint) and
  // flips to true after the mount effect — during the false phase
  // we render the landing WITH its layoutIds (motion records the
  // rects), then the post-mount re-render strips them if
  // keepLandingMounted is on. Cached rects survive the strip → next
  // modal open uses them as the FLIP source → spring morph plays.
  const mounted = useMounted();
  // The drawerOpen condition (B.PT177) is critical: it keeps the
  // landing's layoutIds ACTIVE for as long as the modal is closed,
  // so motion always has a fresh rect measurement to fall back on.
  // The strip only fires at the moment the modal opens — motion's
  // last-recorded rect (from the previous render's measurement)
  // becomes the FLIP source for the modal phantoms. Without this,
  // a prior production-mode modal cycle (which unmounts + remounts
  // the landing) shuffles motion's cache state, and a subsequent
  // switch to inspect mode fires the strip on a still-mounted
  // landing before any fresh measurement → motion's cache becomes
  // stale → next modal open in inspect mode skips the morph and
  // just fades. Tying the strip to drawerOpen means motion always
  // measures the landing right before it goes invisible.
  const { data: fetchedUser } = trpc.users.getByHandle.useQuery(
    { handle },
    {
      initialData: initialUser,
      // Visitor-surface query stabilization (B.PT-instant). The
      // default TanStack `refetchOnWindowFocus: true` triggered a
      // visible UI freeze every time the user alt-tabbed back to
      // /h/[handle] or hit the browser back button — re-mount
      // refetched user + slots and the modal animation hung waiting
      // on data. dub.co's `use-links.ts:61-66` disables focus refetch
      // on its public read queries for the same reason.
      // 5-min staleTime: host profile data (name, bio, avatar,
      // duration list) is effectively static within a session.
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
    },
  );
  // B.PT276 — track which slot duration the visitor clicked on the
  // landing card. Modal renders the label in its chrome row; the
  // slot query (B.PT277) refires with the picked minutes so server-
  // returned slots fit + reflect range-overlap against the new
  // duration. State declared before the slot query so the hook can
  // read it on first render.
  const [selectedDurationLabel, setSelectedDurationLabel] = useState<
    string | undefined
  >(undefined);
  const [selectedDurationMinutes, setSelectedDurationMinutes] = useState<
    number | undefined
  >(undefined);
  // B.PT277 — slot query refetches when the visitor changes chip.
  // SSR's `initialSlots` covers the host's default duration
  // (page.tsx prefetches without `durationMinutes`, so the server
  // resolves the host's primary chip). After a chip click,
  // react-query refires with the new duration → server returns
  // slots that fit + reflect range-overlap with existing bookings.
  //
  // `placeholderData: keepPreviousData` is the TanStack Query 5
  // canonical fix for query-key transitions: instead of dropping
  // into the empty "no data yet" state while the new duration's
  // slots fetch (which produced the visible ~1s blank chip strip
  // on /h/[handle] chip clicks), the cache hands back the
  // previous-query's data and flips `isPlaceholderData: true`
  // until the fetch resolves. The strip stays interactive +
  // visible the whole time. Reference: tanstack.com/query/v5/
  // docs/framework/react/guides/paginated-queries#better-paginated-
  // queries-with-placeholderdata.
  const fetchedSlotsResult = trpc.schedule.getUpcomingSlots.useQuery(
    {
      handle,
      durationMinutes: selectedDurationMinutes,
    },
    {
      // initialData only matches when the picked duration is undefined
      // (the SSR default-resolution path). After the visitor clicks a
      // chip the query keys diverge from the SSR cache and refetches.
      initialData:
        selectedDurationMinutes === undefined ? initialSlots : undefined,
      placeholderData: keepPreviousData,
      // Same visitor-surface stabilization as `getByHandle` — kills
      // the focus/back-nav refetch freeze. Slot availability changes
      // server-side but the 5-min staleTime is fine for a visitor
      // session; the SSE bus (live-queue) doesn't reach the visitor
      // surface so refetch-on-mount is the only invalidation path
      // anyway.
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
    },
  );
  const user = fetchedUser ?? initialUser;
  const slots = fetchedSlotsResult.data ?? initialSlots;
  // `isFetching && isPlaceholderData` means the cache handed us the
  // previous duration's slots while the new one fetches. This is the
  // signal to render a loading affordance inside the strip (small
  // centered spinner) without unmounting the prior data — the click
  // feels instant, the visible spinner tells the user a refresh is
  // in flight.
  const slotsFetchingFresh =
    fetchedSlotsResult.isFetching && fetchedSlotsResult.isPlaceholderData;
  // React 19 transitions — wraps the chip-click setState batch so
  // the modal-open call stays urgent (drives the morph animation)
  // while the per-chip side effects (duration label, minutes, query
  // key change) flow through as non-urgent work. Net effect: the
  // click registers + modal slide starts in the same frame, render
  // contention from the query-key change happens off the critical
  // path.
  const [, startTransition] = useTransition();
  const router = useRouter();

  // B.PT306e — ref to the visitor-shell header wrapper. Passed into
  // the picker modal's `<FocusOn shards>` array so the header (which
  // sits OUTSIDE the modal's focus-trap subtree) stays interactive
  // while the modal is open. Without this shard, react-focus-on
  // marks every sibling of the modal as aria-hidden / inert as part
  // of its a11y focus-trap, and the Cancel / Back to dashboard
  // buttons inside the header become non-interactive even though
  // they paint visually above the modal at `z-[60]`.
  const visitorHeaderRef = useRef<HTMLDivElement>(null);

  // Eager prefetch — warm the React Query cache for EVERY duration
  // the host offers, in parallel, right after mount. Visitors usually
  // click a duration chip within the first ~1-2s of landing; by the
  // time they tap, the cache for that chip's slot list is already
  // populated, so `placeholderData: keepPreviousData` ALSO has a
  // fresh hit to swap in instantly. Net effect: zero perceptible
  // network delay on chip clicks. Pattern matches dub.co's analytics
  // dashboard which prefetches adjacent date-range queries on mount.
  const utils = trpc.useUtils();
  useEffect(() => {
    if (!user.durationChoices || user.durationChoices.length <= 1) return;
    // Stagger by a microtask so the initial-paint critical path isn't
    // contended by N parallel network requests. The default duration
    // is already covered by SSR's `initialSlots`, so skip it.
    void Promise.resolve().then(() => {
      for (const choice of user.durationChoices) {
        if (choice.minutes === user.defaultDurationMinutes) continue;
        void utils.schedule.getUpcomingSlots.prefetch({
          handle,
          durationMinutes: choice.minutes,
        });
      }
    });
    // user.durationChoices reference is stable across SSR-hydrated +
    // client-fetched payloads (server returns the same shape); handle
    // never changes within the page lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const now = new Date(renderedAt);
  const availableSlots = slots.filter(isOpenSlot);
  const nextSlot = availableSlots[0];
  const visitorTz = useVisitorTz();
  const openToday = availableSlots.some((s) => isToday(new Date(s.start), now));
  const daysWithOpenSlotsThisWeek = countOpenDaysThisWeek(availableSlots, now);

  const [drawerOpen, setDrawerOpenRaw] = useState(false);
  const [receiptTransitionPending, setReceiptTransitionPending] =
    useState(false);
  // B.PT261 — gate `setDrawerOpen` against in-flight modal-card
  // exit animations. Motion 12's shared-`layoutId` projection
  // registry (see motion #3424 — "Shared layout animation uses
  // stale snapshot when clicking items rapidly") accumulates a
  // stale rect during fast open→close→open cycles; the next open
  // pulls that stale rect as its source and either visually
  // glitches (B.PT260's "translates X then snaps back") or
  // crashes inside the projection forEach with `undefined is not
  // an object (evaluating 'projectionDelta.x')`. Canonical
  // workaround per motion's own community responses to #3424:
  // suppress retriggers while the previous animation cycle is in
  // flight. Cleared in the modal's outer-AnimatePresence
  // `onExitComplete` (passed below) so the next open is always
  // fired against a stable, fully-settled projection registry.
  const exitInFlightRef = useRef(false);
  const pendingOpenRef = useRef(false);
  const setDrawerOpen = (next: boolean) => {
    if (exitInFlightRef.current && next) {
      // Mid-exit re-open: queue the intent. onExitComplete (below)
      // sees the queued flag, fires the open AFTER the projection
      // registry has settled. Avoids the projection-delta crash
      // AND preserves the user's intent — they don't have to
      // click again.
      pendingOpenRef.current = true;
      return;
    }
    if (drawerOpen && !next) exitInFlightRef.current = true;
    setDrawerOpenRaw(next);
  };
  // B.PT229 — chrome-row meeting-duration label.
  // B.PT276 — selectedDuration state lifted earlier in the component
  // (B.PT277 needs it for the slot query); this anchor block is the
  // legacy comment site, kept so a search for the original B.PT229
  // explainer still lands somewhere structured.

  // B.PT276 — chip strip data from `users.getByHandle` (B.PT158).
  // Empty list defends against a race where the backend ships an
  // empty array (shouldn't happen — `resolveDurationChoices` collapses
  // to `[durationMins]` server-side) but keeps the chip strip from
  // rendering 0 rows in production.
  const slotOptions: ReadonlyArray<SlotOption> =
    initialUser.durationChoices.length > 0
      ? initialUser.durationChoices.map((m) => minutesToSlotOption(m, t))
      : FALLBACK_SLOT_OPTIONS;
  const receiptRouteActive = pathname.includes(`/h/${handle}/booked/`);
  const receiptOverlayActive = receiptRouteActive || receiptTransitionPending;
  useEffect(() => {
    if (!receiptRouteActive) setReceiptTransitionPending(false);
  }, [receiptRouteActive]);
  // B.PT175 + B.PT177 — the strip only fires when ALL three hold:
  // (a) we're past the initial mount (motion has had a chance to
  //     measure landing's layoutIds at least once),
  // (b) keepLandingMounted is on (inspect mode),
  // (c) the modal is currently opening or open.
  // (a) and (b) together prevent SSR/first-paint weirdness; (c)
  // keeps the rect cache fresh across mode-switches that follow a
  // production-mode modal cycle. Layout ID stripping in the same
  // render where the modal opens means motion's last measurement
  // (taken just before drawerOpen flipped) becomes the FLIP source
  // for the modal phantoms.
  const stripLandingLayoutId =
    mounted && ((keepLandingMounted && drawerOpen) || receiptOverlayActive);
  const landingLayoutId = (id: string) =>
    stripLandingLayoutId ? undefined : id;
  const identityProjectionTransition = {
    type: "spring",
    ...(drawerOpen ? openSpring : closeSpring),
  } satisfies ComponentProps<typeof motion.div>["transition"];

  // URL is a mirror of the visitor's selection — start undefined so SSR
  // and the first client render agree, then hydrate from `?date=`/`?slot=`
  // in the effect below. cal.com pattern: store is the truth at runtime,
  // URL is the truth across reload/share/back.
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedSlot, setSelectedSlot] = useState<Slot | undefined>();
  // A9 / B.PT305 — `?reschedule=<bookingUid>` puts the picker in
  // reschedule mode. Triggered from the booked confirmation page's
  // Reschedule popover. Read directly from `useSearchParams()` so the
  // value tracks URL changes ON SOFT NAVIGATION (the receipt's
  // Reschedule confirm does `router.push('/h/[handle]?reschedule=...')`;
  // the parent host-profile stays mounted across that nav since it's
  // the `children` slot — only the `@receipt` slot unmounts). Reading
  // from URL on every render means the new value flows in without a
  // setState-in-effect dance. Per Next.js App Router docs: `useSearch
  // Params` re-renders on every client-side URL change, which is the
  // exact reactivity we want here.
  const searchParams = useSearchParams();
  const rescheduleFromUid = searchParams.get("reschedule") ?? undefined;

  // Seed selection (`date` + `slot`) from URL once on mount. These two
  // params are visitor-driven local state — the form layer writes them
  // back on pick — so they don't need the reactive useSearchParams
  // treatment. Run once; popstate handles back/forward.
  useEffect(() => {
    const dateStr = getQueryParam("date");
    if (dateStr) {
      const parsed = parseDateKey(dateStr);
      if (parsed) setSelectedDate(parsed);
    }
    const slotIso = getQueryParam("slot");
    if (slotIso) {
      const matching = slots.find((s) => s.start === slotIso);
      if (matching) setSelectedSlot(matching);
    }
    // Run once — slots prop changes after this should NOT clobber the
    // visitor's selection. If a fetch returns new slots that no longer
    // contain the picked one, the drawer handles the empty case.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // B.PT305 — auto-open the picker modal the moment reschedule mode
  // enters from the URL. Two callsites trip this:
  //   1. Soft nav from the receipt's Reschedule popover. The receipt's
  //      `@receipt/[...catchAll]/page.tsx` returns null, so motion's
  //      AnimatePresence exits the receipt card; this effect opens the
  //      picker modal in the SAME commit, so motion's shared
  //      `layoutId="handle-card"` morphs receipt → picker directly
  //      (the user's "transform the form to the choosing-date form
  //      again" intent).
  //   2. Hard refresh / deep-link with `?reschedule=<uid>`. Lands the
  //      visitor in the picker without an extra chip click.
  // Ref-gated so the open fires ONLY on the undefined → set
  // transition. Once the user closes the modal we don't re-open it
  // on every URL re-evaluation — that would trap them.
  const lastRescheduleUidRef = useRef<string | undefined>(undefined);
  // B.PT306g — `useLayoutEffect`, NOT `useEffect`. The auto-close
  // branch fires the moment the URL strips `?reschedule=…` (e.g.
  // visitor X-closes the receipt after a cancel). With a regular
  // `useEffect`, the effect runs AFTER paint — meaning the picker
  // modal would render (and FocusOn would activate, walking the DOM
  // to mark siblings as `aria-hidden` / inert + registering its
  // document-level click listeners) for one paint cycle BEFORE this
  // effect fires and closes the drawer. That brief mount leaves
  // FocusOn artifacts in the document: click events on the landing
  // card's duration chips get swallowed by stale outside-click
  // listeners even though hover/pointer-events still fire (FocusOn
  // hooks into `mousedown`/`mouseup` outside-detection, not
  // `mouseover`). Symptom: "hover triggers but click doesn't."
  // `useLayoutEffect` runs synchronously after DOM commit but BEFORE
  // paint, and `setState` calls inside it cause an immediate
  // re-render in the same commit cycle — so the modal never reaches
  // a painted state, FocusOn never activates, and no listeners are
  // left behind. React docs (react.dev/reference/react/useLayoutEffect)
  // flag this exact pattern: "Use it when you need to update state
  // based on layout BEFORE the browser repaints the screen."
  useLayoutEffect(() => {
    if (
      rescheduleFromUid &&
      rescheduleFromUid !== lastRescheduleUidRef.current &&
      !drawerOpen
    ) {
      setDrawerOpen(true);
    }
    // Symmetric auto-CLOSE on the set → undefined transition. Without
    // this, the drawer state stays `true` from the auto-open after
    // the user cancels reschedule and X-closes the receipt: the
    // picker silently re-mounts on top of the landing card (its
    // `view` useState resets to "strip", so the visitor lands on the
    // day-strip/slot picker instead of the duration-chip landing
    // they'd expect). Normal booking flow gets this for free via
    // `onBookingComplete` → `setDrawerOpen(false)`; the reschedule-
    // cancel path skipped that callback, hence the stale `true`.
    if (
      !rescheduleFromUid &&
      lastRescheduleUidRef.current &&
      drawerOpen
    ) {
      setDrawerOpen(false);
    }
    lastRescheduleUidRef.current = rescheduleFromUid;
    // setDrawerOpen is stable (lifted from useState in component body);
    // drawerOpen is the gate so we don't fight an open already in
    // progress.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rescheduleFromUid]);

  // Browser back/forward → re-read URL → restore state inside a view
  // transition so the change feels animated, not snappy. This is the
  // "browser back plays an animation" piece — Next's auto view-transition
  // wrap only fires on router navigations, not popstate.
  useEffect(() => {
    function handlePop() {
      const dateStr = getQueryParam("date");
      const slotIso = getQueryParam("slot");
      // flushSync forces React to commit the state update synchronously
      // inside the view-transition callback. Without it, setters queue
      // an async render, the browser snapshots the unchanged DOM, and
      // no animation runs.
      const apply = () =>
        flushSync(() => {
          setSelectedDate(
            dateStr ? (parseDateKey(dateStr) ?? undefined) : undefined,
          );
          setSelectedSlot(
            slotIso ? slots.find((s) => s.start === slotIso) : undefined,
          );
        });
      const doc = document as Document & {
        startViewTransition?: (cb: () => void) => unknown;
      };
      if (typeof doc.startViewTransition === "function") {
        doc.startViewTransition(apply);
      } else {
        apply();
      }
    }
    window.addEventListener("popstate", handlePop);
    return () => window.removeEventListener("popstate", handlePop);
  }, [slots]);

  // B.PT254 — reset hour selection every time the modal opens. Without
  // this, opening → picking an hour → closing → reopening leaves the
  // previously picked slot highlighted in the picker (and bumps the
  // user straight to the form view via the modal's internal `selectedSlot
  // ? form : strip` heuristic). User flow expects a clean picker on
  // each open. Date stays put — losing the day too would force the
  // visitor to re-navigate the calendar, which is the unhelpful kind
  // of reset. URL `?slot=` is wiped in lockstep so the next reopen-via-
  // refresh path is consistent.
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (drawerOpen && !wasOpenRef.current) {
      setSelectedSlot(undefined);
      updateQueryParam("slot", null, { pushEntry: false });
    }
    wasOpenRef.current = drawerOpen;
  }, [drawerOpen]);

  // B.PT-host-display — `displayLabel` is computed server-side by
  // `users.getByHandle` per `deriveHostDisplayLabel` in `lib/handle.ts`:
  // placeholder handle → email-local-part (or name if set); custom
  // handle → handle itself (so the heading mirrors the URL).
  const displayName = user.displayLabel ?? user.handle ?? "Host";
  const initials = toInitials(displayName);

  function handleSelectDate(date: Date | undefined) {
    setSelectedDate(date);

    let nextSlotForDate: Slot | undefined;
    setSelectedSlot((currentSlot) => {
      if (!currentSlot || !date) {
        nextSlotForDate = undefined;
        return undefined;
      }
      const keep = isSameCalendarDay(new Date(currentSlot.start), date)
        ? currentSlot
        : undefined;
      nextSlotForDate = keep;
      return keep;
    });

    // Mirror to URL. Date pick is transient (replaceState — no back-stack
    // entry per click), but if it cleared the slot we wipe that key too.
    updateQueryParams(
      { date: date ? toKey(date) : null, slot: nextSlotForDate?.start ?? null },
      { pushEntry: false },
    );
  }

  const hasSlots = slots.length > 0;
  const hasOpenSlots = availableSlots.length > 0;

  // B.PT155 — visitor-page redesign frame 1 (handle landing).
  // 1-to-1 port of `desktop - dashboard / handle` (324:15683) in the
  // user's Figma file (spec at `docs/figma/spec-h-handle-redesign.json`).
  //
  // Layout (Figma absolute geometry):
  //   - Outer chrome: `oh-host-content` Sisal frame (existing token,
  //     #EEE7D5 paper inside #D3CCBD frame). Provided by OhVisitorShell.
  //   - Sticky header: `/h/<handle>` eyebrow left + 8px status dot +
  //     status eyebrow right. (Same shape as B.PT110, the redesign
  //     keeps the chrome.)
  //   - Centered card 385×387, padding 15, gap 10 between header
  //     section and slot-list section. Paper bg, cornerRadius 25,
  //     1px hairline border.
  //     - Identity header (Frame 15, 336×87): avatar 55×55 fully
  //       rounded with 1px ring + h1 name (Space Grotesk Bold ~52px,
  //       size 269×55) on the same row, gap 12; then
  //       `oh-description` tagline below (336×20).
  //     - Slot-list inner card (Frame 2, 355×260): cream bg (#F5EFDF
  //       — between paper and white, no existing token; explicit hex
  //       per 1-to-1 directive), cornerRadius 20, 1px border, padding
  //       15 + gap 10. Contains 4 slot rows (each 325×50, paper bg,
  //       cornerRadius 14, gap 10 between).
  //
  // 1-to-1 visual fidelity directive (user, 2026-05-05): hardcode the
  // 4 slot row contents — "intro / quick chat, voice only / 15m | 25m
  // | 30m | 1h" — even though we don't have a multi-event-type model
  // per host yet (all bookings today are 15-min single-type slots).
  // The data-model gap is logged as B.PT158 (canonical-win, OPEN /
  // OPTIONAL — don't implement until promoted).
  //
  // Click semantics: tapping any slot row opens the existing
  // `<AvailabilityDrawer>` so the booking flow stays functional while
  // B.PT156 lands the bespoke modal redesign that replaces the drawer.

  return (
    <OhVisitorShell
      className="[--oh-ink:#0a0a0a] [--oh-paper:#eee7d5] dark:[--oh-ink:#ede4cf] dark:[--oh-paper:#1a1a1a]"
      // B.PT306d / B.PT307e — visitor header always sits at z-60
      // above the picker modal (z-50). Used to be conditional on
      // reschedule mode, but the user wanted consistent behavior
      // across the regular scheduling flow too: the URL row + Back
      // to dashboard stay interactive while the picker is open,
      // matching the reschedule-mode UX. Picker's outer wrapper
      // adds matching top padding so its own chrome stays below
      // the header — see HandleModal `rescheduleFromUid` branch
      // for the size split (normal flow uses a shorter padding
      // since the header has 1 row vs 2 in reschedule).
      headerClassName="z-[60]"
      // B.PT306e — pass the header ref through to the picker modal
      // via shards so react-focus-on doesn't make the header inert
      // while the modal's focus trap is active.
      headerRef={visitorHeaderRef}
      header={
        <div className="flex w-full flex-col gap-3">
          <div className="mx-auto flex w-full max-w-[760px] items-center justify-between gap-3 px-0">
            {/* Left cluster: owner-only back-to-dashboard chevron + handle
                URL. Back affordance is an icon-only ArrowLeft button
                positioned as a breadcrumb prefix to `/h/<handle>` so the
                row reads "← path" — the arrow leads, the path follows.
                Owner-only (host viewing their own page); visitors never
                see it. opacity-55 → 100 on hover keeps it quiet against
                the URL's full-opacity eyebrow but discoverable on
                approach. Title attribute surfaces the label on hover for
                pointer users; aria-label covers screen readers. */}
            <div className="flex items-center gap-2">
              {isOwner ? (
                // B.PT307c — chevron uses CSS opacity ONLY (group
                // opacity), with the text color at full alpha. Avoids
                // the "x-ray" effect: when both `currentColor` carries
                // alpha (e.g. `--oh-content-muted` = `rgba(10,10,10,
                // 0.55)`) AND the element has `opacity-55`, each stroke
                // segment is drawn at 0.55 alpha into the layer; where
                // the lucide ArrowLeft's two paths overlap (arrowhead
                // apex + shaft) the per-pixel alpha compounds to ~0.80
                // before the layer composites at 0.55 — the overlap
                // shows ~46% effective alpha versus ~30% elsewhere, the
                // visible seam the user reported. Using full-alpha
                // `--oh-ink` + CSS opacity means each stroke writes
                // alpha 1.0 to the layer, the layer composites once at
                // 0.55, overlaps and non-overlaps render uniformly.
                <Link
                  href="/bookings"
                  aria-label="Back to dashboard"
                  title="Back to dashboard"
                  className="oh-focus-ring relative z-[100] inline-flex size-5 shrink-0 items-center justify-center rounded-(--oh-r-xs) text-[color:var(--oh-ink)] opacity-55 transition-opacity duration-150 ease-oh hover:opacity-100"
                >
                  <ArrowLeft
                    aria-hidden
                    strokeWidth={2.25}
                    className="size-3.5"
                  />
                </Link>
              ) : null}
              <span className="oh-eyebrow tabular-nums opacity-100">
                /h/{user.handle}
              </span>
            </div>
            <div className="flex items-center gap-2" role="status">
              <span
                aria-hidden
                className={cn(
                  "size-2 shrink-0 rounded-full transition-colors duration-200 ease-oh",
                  openToday ? "bg-emerald-500" : "bg-neutral-400",
                )}
              />
              <span className="oh-eyebrow opacity-100">
                {openToday ? t("openNow") : t("closedToday")}
              </span>
            </div>
          </div>
          {/* Reschedule banner row — stacks below the URL row inside
              the same sticky chrome region. Hairline `border-t
              border-oh-line` separates the two rows. Amber 2px dot
              reads as a live indicator. Cancel is a `<button>` (not
              a Link) so the click can't bubble into any underlying
              FocusOn click-outside handler; explicit `router.push`
              navigates to the original booking's receipt so motion's
              shared `layoutId="handle-card"` morphs the picker back
              to the receipt the visitor came from (same animation
              contract as the X close). */}
          {rescheduleFromUid ? (
            <div
              role="status"
              className="mx-auto flex w-full max-w-[760px] items-center justify-between gap-3 border-t border-oh-line pt-3"
            >
              <div className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="size-1.5 shrink-0 rounded-full bg-amber-500"
                />
                <span className="oh-eyebrow truncate opacity-100">
                  {t("rescheduling")}
                </span>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  router.push(
                    `/h/${user.handle}/booked/${rescheduleFromUid}`,
                  );
                }}
                className="oh-focus-ring oh-eyebrow shrink-0 rounded-(--oh-r-xs) opacity-55 transition-opacity hover:opacity-100"
              >
                {t("cancel")}
              </button>
            </div>
          ) : null}
        </div>
      }
    >
      {/* B.PT306d — banner moved back INTO the visitor header (above).
          To keep Cancel clickable while the picker modal (z-50) is
          open, the OhVisitorShell `headerClassName` raises the
          header wrapper's z-index to 60 only while in reschedule
          mode. Single source of chrome — no floating duplicates. */}

      {/* Centered-card scaffold. The card is exactly 385×387 per Figma;
          on viewports narrower than ~415px the card shrinks to fit
          (w-full + max-w-[385px] + horizontal padding on the wrapper).
          Vertical centering uses min-h calc that subtracts the sticky
          header's nominal height (~64px on mobile / 80px sm+) so the
          card visually sits in the OPTICAL center of the remaining
          viewport, not a literal middle that includes the header. */}
      {/* B.PT156 — landing card wrapped in `<motion.article layoutId>`
          so it shares its measured rect with `<HandleModal>`'s same
          `layoutId`. When the modal opens, motion measures both rects
          and morphs the card from 385×387 to the modal's max bounds
          using the spring physics from Figma frame 1 → frame 2.
          `<AnimatePresence>` keeps the unmounting card alive long
          enough for the morph to play; without it, the card would
          pop out instantly. */}
          <AnimatePresence mode="popLayout">
            {!drawerOpen || keepLandingMounted ? (
              <HandleMorphCard
                key="landing-card"
                layoutId={landingLayoutId("handle-card")}
                // B.PT303 — kill motion's default opacity crossfade
                // between lead+follow during the layoutId morph. Both
                // cards share the `.oh-handle-morph-card` class which
                // applies `box-shadow: var(--oh-handle-card-shadow)`;
                // in dark mode that token resolves to `--oh-shadow-popup`
                // (drop shadow). With crossfade ON, lead+follow render
                // simultaneously through the morph → two stacked drop
                // shadows visible behind the modal during animation,
                // disappearing once the lead unmounts. `layoutCrossfade
                // ={false}` sets `visibility: hidden` on the lead on
                // promote, so its box-shadow vanishes with it. Light
                // mode unaffected (inset shadow has no exterior paint).
                // Public typed in motion-dom/dist/index.d.ts:970.
                layoutCrossfade={false}
                transition={{
                  type: "spring",
                  ...(drawerOpen ? openSpring : closeSpring),
                }}
                // B.PT169 — motion's layoutId crossfade auto-animates
                // opacity FROM the source's value TO the destination's
                // value during the morph. With the destination phantom
                // at opacity 0 (production default), the source landing
                // element fades to 0 even when we set
                // `style.opacity: 1`. Adding explicit `animate` +
                // `exit` makes motion treat the slider value as the
                // interpolation TARGET, overriding the auto-crossfade.
                // User can now set Layer 1 opacity = 1 and the landing
                // stays visible through the entire morph.
                // B.PT181 — initial matches animate so motion doesn't
                // fade-in on (re)mount. Without this, when the modal
                // closes and the landing remounts, motion treats the
                // remount as an entrance and tweens opacity from 0 →
                // animate target — visible as a "clone fades in" beside
                // the still-exiting modal phantom. Same applies on
                // initial mount. With initial = animate, the element
                // starts at its target opacity immediately, the
                // layoutId FLIP transforms its rect without any
                // accompanying opacity tween, and the morph reads as a
                // single element transitioning between rects.
                initial={{
                  ...HANDLE_CARD_RADIUS_STYLE,
                  opacity: oStyle(oL1?.layer, 1),
                }}
                animate={{
                  ...HANDLE_CARD_RADIUS_STYLE,
                  opacity: oStyle(oL1?.layer, 1),
                }}
                exit={{
                  ...HANDLE_CARD_RADIUS_STYLE,
                  opacity: oStyle(oL1?.layer, 1),
                }}
                // B.PT174 — CSS zIndex only applies to positioned
                // elements; the landing motion.article is normally
                // static. When the debug overlay sets a non-zero
                // zL1.layer (via the "landing on top" stack order),
                // pair it with `position: relative` so the zIndex
                // competes against the modal's fixed z-50 wrapper in
                // the document root stacking context.
                style={{
                  position: zL1?.layer ? "relative" : undefined,
                  zIndex: zStyle(zL1?.layer),
                }}
                aria-label={t("landingCardAria", { name: displayName })}
                className={cn(
                  "max-w-[385px] gap-[10px] p-[15px]",
                  // B.PT161 — Figma spec has NO stroke on Frame 1; the
                  // inner shadow + cream-vs-Sisal contrast carry the
                  // edge. Removed `border border-oh-line` from B.PT155.
                  // Radius + inner shadow come from HandleMorphCard so
                  // landing and modal share one painted surface contract.
                )}
              >
                {/* Identity header — Frame 15 (336×87). `layoutId="oh-identity"`
                  pairs with the phantom inside `<HandleModal>` at the modal's
                  target position (192,22), opacity 0 — the user's Smart Animate
                  trick: matched destinations let motion morph + crossfade in
                  one continuous transition, much smoother than a pure fade. */}
                <motion.header
                  layoutId={landingLayoutId("oh-identity")}
                  transition={identityProjectionTransition}
                  initial={{ opacity: oStyle(oL1?.identity, 1) }}
                  animate={{ opacity: oStyle(oL1?.identity, 1) }}
                  exit={{ opacity: 0 }}
                  style={{
                    visibility: stripLandingLayoutId ? "hidden" : undefined,
                    zIndex: zStyle(zL1?.identity),
                    // `container-type: inline-size` lets the h1
                    // below use `cqi` units to size against THIS
                    // card's actual inline width — not the
                    // viewport. Without this, the prior
                    // `vw`-driven clamp() emitted 52px on a 1440px
                    // desktop even though the 336-wide card only
                    // has ~270px of inline space for the name
                    // (after the 55px avatar + 12px gap), so long
                    // handles like "santiagofuentesg" overflowed
                    // the card right edge.
                    containerType: "inline-size",
                  }}
                  className="mx-auto flex w-[336px] max-w-full flex-col gap-3"
                >
                  <motion.div
                    layoutId={landingLayoutId("oh-identity-row")}
                    layout
                    transition={identityProjectionTransition}
                    initial={{ opacity: 1 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 1 }}
                    className="flex min-w-0 items-center gap-3"
                  >
                    <motion.span
                      layoutId={landingLayoutId("oh-identity-avatar")}
                      layout="position"
                      transition={identityProjectionTransition}
                      initial={{ opacity: 1 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 1 }}
                      style={HANDLE_AVATAR_PROJECTION_STYLE}
                      className="relative inline-flex size-[55px] shrink-0"
                    >
                      <HandleHostAvatarBody
                        src={user.image}
                        alt={displayName}
                        initials={initials}
                      />
                    </motion.span>
                    {/* B.PT161 — spec is Space Grotesk **Bold** (700)
                        at 51.7px / line-height 54.6px / letter-
                        spacing -1.3px on the Figma reference. We
                        keep that as the upper bound but layer in
                        three defenses so no handle (no matter how
                        long) overflows the card:
                          1. Container-query sizing — `cqi` resolves
                             against THIS card's inline width
                             (header has `container-type: inline-
                             size`), not viewport. Cap at 52px so
                             short names hit the Figma spec; clamp
                             floor 22px so super-narrow viewports
                             still read.
                          2. `min-w-0` lets flex actually constrain
                             the h1 (without it, flex items grow to
                             content width regardless of parent).
                          3. `[overflow-wrap:anywhere]` + `break-
                             words` + `text-balance` — names that
                             still don't fit at the floor font size
                             wrap to a second line with balanced
                             distribution instead of overflowing
                             horizontally.
                        Net: short names render at spec; medium
                        names shrink fluidly; very long handles wrap
                        cleanly. Never overflows. */}
                    <motion.h1
                      layoutId={landingLayoutId("oh-identity-title")}
                      layout="position"
                      transition={identityProjectionTransition}
                      initial={{ opacity: 1 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 1 }}
                      className="min-w-0 break-words text-balance font-sans text-[clamp(22px,11cqi,52px)] font-bold leading-[1.06] tracking-[-0.04em] [overflow-wrap:anywhere]"
                    >
                      {displayName}
                    </motion.h1>
                  </motion.div>
                  {/* B.PT161 — tagline is text-align CENTER per spec
                    (textAlignHorizontal: CENTER). Was left-default.
                    B.PT297 — closes B.PT279's deferred row: render
                    `user.bio` (already exposed in `getByHandle` since
                    B.PT279 shipped the schema + mutation) here in
                    place of the static placeholder. Falls back to
                    the placeholder copy when the host hasn't set a
                    bio yet (cal.com convention — empty bio renders
                    a generic "schedule with {name}" line so the
                    visitor surface never reads as broken). */}
                  <motion.p
                    layout="position"
                    transition={identityProjectionTransition}
                    className="oh-description text-center"
                  >
                    {user.bio ?? t("defaultBio")}
                  </motion.p>
                </motion.header>

                {/* Slot-list inner card — Frame 2 (355×260). Cream bg
                  (#F5EFDF in Figma) is between paper (#EEE7D5) and white;
                  no existing token, so explicit hex per the 1-to-1
                  directive. INNER_SHADOW radius=4 from spec. The card
                  itself shares `layoutId="oh-slot-list"` with the modal's
                  phantom slot-list wrapper (positioned at (0,0) full-modal
                  size, opacity 0) so motion morphs the cream container
                  alongside its child slot rows. */}
                <motion.div
                  layoutId={landingLayoutId("oh-slot-list")}
                  transition={{
                    type: "spring",
                    ...(drawerOpen ? openSpring : closeSpring),
                  }}
                  initial={{
                    ...HANDLE_SLOT_LIST_RADIUS_STYLE,
                    opacity: oStyle(oL1?.slotList, 1),
                  }}
                  animate={{
                    ...HANDLE_SLOT_LIST_RADIUS_STYLE,
                    opacity: oStyle(oL1?.slotList, 1),
                  }}
                  exit={{
                    ...HANDLE_SLOT_LIST_RADIUS_STYLE,
                    opacity: 0,
                  }}
                  style={{
                    ...HANDLE_SLOT_LIST_RADIUS_STYLE,
                    boxShadow: "inset 0 0 4px rgba(0,0,0,0.25)",
                    zIndex: zStyle(zL1?.slotList),
                  }}
                  className={cn(
                    // B.PT161 — Figma Frame 2 has NO stroke; only the
                    // inner shadow defines the edge. Removed the
                    // `border border-oh-line` that B.PT155 added.
                    // B.PT210 — `p-[15px]` removed (now lives only
                    // on motion.ul / oh-slot-stack so it mirrors
                    // cleanly to modal's slot-stack motion.div).
                    // Single source of truth for the cream gutter.
                    "relative flex flex-col gap-2.5",
                    // `#F5EFDF` is paper (`#EEE7D5`) lifted ~5% L*.
                    // Dark counterpart `#272727` is dark-paper
                    // (`#1a1a1a`) lifted ~5% L* — same elevation
                    // relationship over the dark surface so the
                    // slot-list reads as the same "lifted card"
                    // on either theme.
                    "bg-[#F5EFDF] dark:bg-[#272727]",
                  )}
                >
                  {slotOptions.length === 0 ? (
                    // B.PT278 — host has no bookable durations
                    // configured (the editor's chip list is empty).
                    // Visitor sees a polite "not accepting bookings"
                    // line instead of the chip strip + a stray
                    // "no slots" empty state. Supersedes the slot
                    // checks below — without a duration the visitor
                    // can't pick a slot anyway.
                    //
                    // Padding: `p-6` (24px on all sides) so the copy
                    // doesn't hug the chip-area's rounded edges. Copy
                    // dropped the host's name prefix — name's already
                    // prominent at the top of the page, repeating it
                    // here just stretched the line and crowded the
                    // narrow chip column.
                    <p className="oh-description p-6 text-center">
                      {t("emptyNoDurationsDescription")}
                    </p>
                  ) : hasOpenSlots ? (
                    <motion.ul
                      layoutId={landingLayoutId("oh-slot-stack")}
                      transition={{
                        type: "spring",
                        ...(drawerOpen ? openSpring : closeSpring),
                      }}
                      style={{ boxShadow: "none" }}
                      // B.PT209 — `p-[15px]` mirrored on the modal's
                      // matching `oh-slot-stack` motion.div in
                      // handle-modal.tsx. Shared `layoutId` only
                      // animates bbox between two elements; CSS
                      // (className, style) is INDEPENDENT per side.
                      // To make padding apply in BOTH layers, set
                      // it on both motion elements that share the
                      // id. Per Motion docs (motion.dev/docs/react-
                      // layout-animations): layoutId animates "from
                      // the previous element's size and position" —
                      // only size/position transfer, not styles.
                      className="flex flex-col gap-2.5 p-[15px]"
                    >
                      {slotOptions.map((opt, i) => {
                        // B.PT213 — uniform concentric radius on
                        // all 4 corners of every chip (was per-
                        // index in B.PT212 — top corners of first +
                        // bottom corners of last). User: "make all
                        // corners the same concentric value … all
                        // chips all sides." Reads as a consistent
                        // family of rounded pills sharing one
                        // radius vocabulary derived from the cream
                        // rect via Apple HIG `outer - margin`.
                        const slotRadiusStyle = cornerRadiusStyle(
                          HANDLE_SLOT_CONCENTRIC_OUTER_RADIUS,
                        );
                        return (
                          <li key={opt.label}>
                            {/* Figma's matched layer is the painted `slot`
                            frame itself, not a transparent wrapper
                            around a button. Put layoutId on SlotRow so
                            size/radius/shadow interpolate on the same
                            element that paints the chip. */}
                            <SlotRow
                              layoutId={landingLayoutId(`oh-slot-${i}`)}
                              transition={{
                                type: "spring",
                                ...(drawerOpen ? openSpring : closeSpring),
                              }}
                              initial={{
                                ...slotRadiusStyle,
                                opacity: oStyle(
                                  oL1
                                    ? [
                                        oL1.slot0,
                                        oL1.slot1,
                                        oL1.slot2,
                                        oL1.slot3,
                                      ][i]
                                    : undefined,
                                  1,
                                ),
                              }}
                              animate={{
                                ...slotRadiusStyle,
                                opacity: oStyle(
                                  oL1
                                    ? [
                                        oL1.slot0,
                                        oL1.slot1,
                                        oL1.slot2,
                                        oL1.slot3,
                                      ][i]
                                    : undefined,
                                  1,
                                ),
                              }}
                              exit={{
                                ...slotRadiusStyle,
                                opacity: oStyle(
                                  oL1
                                    ? [
                                        oL1.slot0,
                                        oL1.slot1,
                                        oL1.slot2,
                                        oL1.slot3,
                                      ][i]
                                    : undefined,
                                  1,
                                ),
                              }}
                              style={{
                                position: zL1 ? "relative" : undefined,
                                zIndex: zStyle(
                                  zL1
                                    ? [
                                        zL1.slot0,
                                        zL1.slot1,
                                        zL1.slot2,
                                        zL1.slot3,
                                      ][i]
                                    : undefined,
                                ),
                              }}
                              figmaLayer={`landing-slot-${i}`}
                              // B.PT303 — host-customized title +
                              // description override the placeholders.
                              // Falls back to the locale-aware fullLabel
                              // (e.g. "15 minutes") when the host
                              // hasn't set a title; description falls
                              // through to empty string so SlotRow's
                              // subtitle slot collapses cleanly.
                              title={opt.title ?? opt.fullLabel}
                              description={opt.description ?? ""}
                              durationLabel={opt.label}
                              onClick={() => {
                                // B.PT-instant — split urgent vs non-
                                // urgent updates. `setDrawerOpen(true)`
                                // is URGENT: it drives the motion
                                // shared-layout morph, must paint in
                                // the same frame as the click so the
                                // modal slide feels instant.
                                // Duration label + minutes are NON-
                                // urgent: they update the chrome row
                                // copy + the query key. Wrapping them
                                // in `startTransition` defers them off
                                // the critical path, so the modal-mount
                                // commit isn't contended by the slot-
                                // query re-key in the same frame.
                                // Reference: react.dev/reference/react/
                                // useTransition — "use transitions to
                                // mark state updates as non-urgent."
                                // Also prefetch the booked route's
                                // server payload — we don't know the
                                // bookingUid yet, but the route
                                // segment (layout + page chrome) is
                                // shared across uids, so prefetching
                                // it primes the App Router cache for
                                // the post-submit navigation.
                                router.prefetch(`/h/${handle}/booked`);
                                startTransition(() => {
                                  setSelectedDurationLabel(opt.fullLabel);
                                  setSelectedDurationMinutes(opt.minutes);
                                });
                                setDrawerOpen(true);
                              }}
                            />
                          </li>
                        );
                      })}
                    </motion.ul>
                  ) : (
                    <p className="oh-description py-6 text-center">
                      {!hasSlots
                        ? t("emptyClosedDescription", { name: displayName })
                        : t("emptyBookedDescription", { name: displayName })}
                    </p>
                  )}
                  {/* In-flight loading affordance. Only mounts when
                      the slot query is BOTH refetching AND serving
                      `placeholderData` from the previous duration —
                      so the strip stays visible (no skeleton) and a
                      small centered spinner tells the user that a
                      fresh availability check is in progress. Per
                      user request: "show a loading icon in the
                      middle instead of a skeleton." */}
                  {slotsFetchingFresh ? (
                    <div
                      className="pointer-events-none absolute inset-0 flex items-center justify-center"
                      aria-live="polite"
                      aria-busy="true"
                    >
                      <span className="rounded-full bg-[var(--oh-paper)] p-2 shadow-[var(--oh-shadow-resting)]">
                        <Loader2
                          aria-hidden
                          strokeWidth={1.75}
                          className="size-4 animate-spin opacity-65"
                        />
                      </span>
                    </div>
                  ) : null}
                </motion.div>
              </HandleMorphCard>
            ) : null}
          </AnimatePresence>

          {/* Visitor TZ probe + days-with-slots are computed but not surfaced
          in the new landing layout. They're consumed inside the modal +
          BookingDrawer indirectly via the same store; keep the
          computations alive so the popstate handler + URL sync work. */}
          <span className="sr-only" aria-hidden>
            {visitorTz} {daysWithOpenSlotsThisWeek} {nextSlot?.start ?? ""}
          </span>

          {/* B.PT156 — bespoke morphing modal replaces `<AvailabilityDrawer>`
          on this page. `AnimatePresence` keeps the unmounting modal
          alive long enough to morph back into the landing card.
          `popLayout` mode is required on the parent (above) so the
          shared-`layoutId` element transition works across mount/unmount
          boundaries without intermediate jumps. */}
          <AnimatePresence
            mode="popLayout"
            onExitComplete={() => {
              // B.PT261 — modal exit fully settled. Clear the
              // gate AND fire any queued open intent so the user
              // who clicked open mid-exit doesn't have to click
              // again.
              exitInFlightRef.current = false;
              if (pendingOpenRef.current) {
                pendingOpenRef.current = false;
                setDrawerOpenRaw(true);
              }
            }}
          >
            {hasOpenSlots && drawerOpen && !receiptOverlayActive ? (
              <HandleModal
                key="handle-modal"
                handle={handle}
                slots={slots}
                open
                // B.PT306e — visitor-header ref forwarded as a
                // focus-trap shard so the Cancel + Back to dashboard
                // affordances in the header stay clickable while the
                // picker is open.
                extraShards={[visitorHeaderRef]}
                // B.PT308 — host's configured rolling window. Day-
                // strip uses this to render exactly enough cells to
                // cover the window (was hardcoded 63, clipping
                // anything > 9 weeks).
                bookingHorizonDays={user.bookingHorizonDays}
                onOpenChange={(next) => {
                  // B.PT306b — dismissing the picker (X / Escape /
                  // click-outside / chrome back) while in reschedule
                  // mode should return the visitor to the ORIGINAL
                  // booking's receipt, not just close the modal. If
                  // we only flipped `drawerOpen` to false, the URL
                  // would stay at `?reschedule=<oldUid>` and the
                  // auto-open effect would re-open the modal on the
                  // next render — trapping the user. Routing to
                  // `/booked/<oldUid>` strips the query param AND
                  // re-mounts the original receipt (which is still
                  // alive — the reschedule hasn't fired). This is
                  // the primary "cancel the reschedule" path; the
                  // banner Cancel link is a secondary affordance.
                  if (!next && rescheduleFromUid) {
                    router.push(
                      `/h/${user.handle}/booked/${rescheduleFromUid}`,
                    );
                    return;
                  }
                  setDrawerOpen(next);
                }}
                selectedDate={selectedDate}
                onSelectDate={handleSelectDate}
                selectedSlot={selectedSlot}
                rescheduleFromUid={rescheduleFromUid}
                durationLabel={selectedDurationLabel}
                durationMinutes={selectedDurationMinutes}
                onPickSlot={(s) => {
                  setSelectedSlot(s);
                  updateQueryParam("slot", s.start, { pushEntry: true });
                }}
                onBookingComplete={() => {
                  setReceiptTransitionPending(true);
                  setDrawerOpen(false);
                }}
                // B.PT175 — content rendered inside the modal's
                // `oh-identity` phantom rect (336×87 at 192,22 inside
                // the modal's frame) when keepLandingMounted is on.
                // Mirrors what B.PT172 did for slot rows (phantom rects
                // had no content → user couldn't see chips at
                // destination → SlotRow rendered inside). The identity
                // row/title/avatar use their own shared layout IDs
                // when the identity phantom is intentionally visible
                // in debug. Production leaves the phantom opacity at
                // 0, so HandleModal keeps only the measuring rect and
                // does not mount these nested projected children.
                identityContent={
                  <motion.div
                    layoutId="oh-identity-row"
                    layout
                    transition={identityProjectionTransition}
                    initial={{ opacity: 1 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 1 }}
                    // `min-w-0` mirrors the landing-card change so
                    // the identity-row inside the modal also lets
                    // the h1 shrink/wrap instead of forcing
                    // horizontal overflow. The modal phantom shares
                    // the layoutId family with the landing card, so
                    // the same flex contract must apply both sides.
                    className="flex min-w-0 items-center gap-3"
                    style={{ containerType: "inline-size" }}
                  >
                    <motion.span
                      layoutId="oh-identity-avatar"
                      layout="position"
                      transition={identityProjectionTransition}
                      initial={{ opacity: 1 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 1 }}
                      style={HANDLE_AVATAR_PROJECTION_STYLE}
                      className="relative inline-flex size-[55px] shrink-0"
                    >
                      <HandleHostAvatarBody
                        src={user.image}
                        alt={displayName}
                        initials={initials}
                      />
                    </motion.span>
                    <motion.h1
                      layoutId="oh-identity-title"
                      layout="position"
                      transition={identityProjectionTransition}
                      initial={{ opacity: 1 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 1 }}
                      // Same overflow defenses as the landing-card
                      // h1 (see comment block on the other h1).
                      // Container-relative `cqi` sizing + `min-w-0`
                      // + wrap fallback so no handle overflows.
                      className="min-w-0 break-words text-balance font-sans text-[clamp(22px,11cqi,52px)] font-bold leading-[1.06] tracking-[-0.04em] [overflow-wrap:anywhere]"
                    >
                      {displayName}
                    </motion.h1>
                  </motion.div>
                }
              />
            ) : null}
          </AnimatePresence>
    </OhVisitorShell>
  );
}

// ——— Helpers ———

// Parse a "YYYY-MM-DD" key (matches lib/availability `toKey`) as local
// midnight. Avoids `new Date("2026-04-25")` which parses as UTC and
// shifts a day in negative-offset zones.
function parseDateKey(key: string): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return undefined;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function countOpenDaysThisWeek(slots: Slot[], now: Date): number {
  const horizon = new Date(now);
  horizon.setDate(horizon.getDate() + 7);
  const days = new Set<string>();
  for (const s of slots) {
    const d = new Date(s.start);
    if (d >= now && d <= horizon) {
      days.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
    }
  }
  return days.size;
}

function isToday(d: Date, now: Date): boolean {
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function useVisitorTz(): string {
  return useSyncExternalStore(
    () => () => {},
    getVisitorTzLabel,
    () => "—",
  );
}

function toInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function isSameCalendarDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function getVisitorTzLabel(): string {
  try {
    const parts = new Intl.DateTimeFormat(undefined, {
      timeZoneName: "short",
    }).formatToParts(new Date());
    const abbr = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
    if (abbr && /^[A-Z]{2,5}$/i.test(abbr)) return abbr.toUpperCase();
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    const tail = zone.split("/").pop() ?? zone;
    return tail.replace(/_/g, " ").toUpperCase() || "—";
  } catch {
    return "—";
  }
}
