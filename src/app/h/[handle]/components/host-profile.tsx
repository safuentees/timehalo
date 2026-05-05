"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { useMounted } from "@/hooks/use-mounted";
import { useTranslations } from "next-intl";
import type { inferRouterOutputs } from "@trpc/server";
import { trpc } from "@/trpc/hooks";
import type { AppRouter } from "@/trpc/router";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { OhVisitorShell } from "@/components/oh/oh-visitor-shell";
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

// B.PT156 — open spring is the SMART_ANIMATE physics from Figma
// `handle` → `handle-detail` (`docs/figma/anim-h-handle-redesign.json`
// transitions[0]). Same spring drives the `motion.article` landing
// card + the `<HandleModal>`'s shared-`layoutId` element so the morph
// reads as one continuous element.
const OPEN_SPRING = animSpec.transitions[0].spring;
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
};

export default function HostProfile({
  handle,
  initialUser,
  initialSlots,
  renderedAt,
}: Props) {
  const t = useTranslations("HostProfile");
  // B.PT167 / B.PT168 / B.PT170 — Layer 1 debug overrides from the
  // route-level debug overlay context. `null` in production /
  // non-debug → all overrides absent, default behavior preserved.
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
  // Default for the toggle is now TRUE — user is in debug mode,
  // wants the dual-layer / frozen-at-destination view by default.
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
    { initialData: initialUser },
  );
  const { data: fetchedSlots } = trpc.schedule.getUpcomingSlots.useQuery(
    { handle },
    { initialData: initialSlots },
  );
  const user = fetchedUser ?? initialUser;
  const slots = fetchedSlots ?? initialSlots;
  const now = new Date(renderedAt);
  const availableSlots = slots.filter(isOpenSlot);
  const nextSlot = availableSlots[0];
  const visitorTz = useVisitorTz();
  const openToday = availableSlots.some((s) => isToday(new Date(s.start), now));
  const daysWithOpenSlotsThisWeek = countOpenDaysThisWeek(
    availableSlots,
    now,
  );

  const [drawerOpen, setDrawerOpen] = useState(false);
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
  const stripLandingLayoutId = mounted && keepLandingMounted && drawerOpen;
  const landingLayoutId = (id: string) =>
    stripLandingLayoutId ? undefined : id;

  // URL is a mirror of the visitor's selection — start undefined so SSR
  // and the first client render agree, then hydrate from `?date=`/`?slot=`
  // in the effect below. cal.com pattern: store is the truth at runtime,
  // URL is the truth across reload/share/back.
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedSlot, setSelectedSlot] = useState<Slot | undefined>();
  // A9 — `?reschedule=<bookingUid>` puts the picker in reschedule
  // mode. Triggered from the booked confirmation page's Reschedule
  // button. Also seeded post-mount so SSR + first client render agree
  // on `undefined` (matches the URL-from-effect pattern above).
  const [rescheduleFromUid, setRescheduleFromUid] = useState<
    string | undefined
  >();

  // Seed selection from URL once on mount, after hydration. Read once;
  // popstate handles forward updates, our setters write back.
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
    const rescheduleUid = getQueryParam("reschedule");
    if (rescheduleUid) {
      setRescheduleFromUid(rescheduleUid);
    }
    // Run once — slots prop changes after this should NOT clobber the
    // visitor's selection. If a fetch returns new slots that no longer
    // contain the picked one, the drawer handles the empty case.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
            dateStr ? parseDateKey(dateStr) ?? undefined : undefined,
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

  const displayName = user.name ?? user.handle ?? "Host";
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
      header={
        <div className="mx-auto flex w-full max-w-[760px] items-center justify-between gap-3 px-0">
          <span className="oh-eyebrow tabular-nums opacity-100">
            /h/{user.handle}
          </span>
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
      }
    >
      {/* A9 — reschedule banner. Surfaces when `?reschedule=<uid>` is in
          the URL so the visitor knows they're picking a NEW slot to swap
          into, not booking fresh. Subtle tint (oh-tint, ~6% ink) reads as
          a status strip without competing with the page's content. Sits
          ABOVE the centered card so it doesn't compete with the card's
          white space. */}
      {rescheduleFromUid ? (
        <div
          role="status"
          className="border-b border-oh-line bg-[color:var(--oh-tint)]"
        >
          <div className="mx-auto flex w-full max-w-[760px] items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <span className="oh-eyebrow opacity-100">{t("rescheduling")}</span>
            <a
              href={`/h/${user.handle}/booked/${rescheduleFromUid}`}
              className="oh-focus-ring oh-eyebrow rounded-(--oh-r-xs) opacity-55 transition-opacity hover:opacity-100"
            >
              {t("cancel")}
            </a>
          </div>
        </div>
      ) : null}

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
      {/* B.PT177 — wrap both AnimatePresence containers (landing +
          modal) in a single LayoutGroup so motion coordinates layout
          measurements ACROSS the AnimatePresence boundaries. Per
          motion docs: "Use LayoutGroup to coordinate layout
          animations between AnimatePresence children and external
          components when mixing exit and layout animations." Without
          this wrapper, the per-layoutId rect cache lives in the
          global motion tree but the AnimatePresence boundaries don't
          share their lifecycle signals — leading to a stale cache
          after a production-mode modal cycle. */}
      <LayoutGroup>
      <div className="flex w-full justify-center px-4 py-10 sm:py-14">
        <AnimatePresence mode="popLayout">
          {!drawerOpen || keepLandingMounted ? (
            <motion.article
              key="landing-card"
              layoutId={landingLayoutId("handle-card")}
              transition={{ type: "spring", ...(drawerOpen ? openSpring : closeSpring) }}
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
              initial={{ opacity: oStyle(oL1?.layer, 1) }}
              animate={{ opacity: oStyle(oL1?.layer, 1) }}
              exit={{ opacity: oStyle(oL1?.layer, 1) }}
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
                "flex w-full max-w-[385px] flex-col gap-[10px] p-[15px]",
                // B.PT161 — Figma spec has NO stroke on Frame 1; the
                // inner shadow + cream-vs-Sisal contrast carry the
                // edge. Removed `border border-oh-line` from B.PT155.
                "rounded-[25px] bg-[color:var(--oh-paper)]",
                // B.PT159 — INNER_SHADOW from spec on Frame 1
                // (radius=14.9, color=black/0.25). Tailwind arbitrary
                // value; same shadow lives on the modal card so the
                // morph keeps the shadow continuous.
                "shadow-[inset_0_0_15px_rgba(0,0,0,0.25)]",
              )}
            >
              {/* Identity header — Frame 15 (336×87). `layoutId="oh-identity"`
                  pairs with the phantom inside `<HandleModal>` at the modal's
                  target position (192,22), opacity 0 — the user's Smart Animate
                  trick: matched destinations let motion morph + crossfade in
                  one continuous transition, much smoother than a pure fade. */}
              <motion.header
                layoutId={landingLayoutId("oh-identity")}
                transition={{ type: "spring", ...(drawerOpen ? openSpring : closeSpring) }}
                initial={{ opacity: oStyle(oL1?.identity, 1) }}
                animate={{ opacity: oStyle(oL1?.identity, 1) }}
                exit={{ opacity: oStyle(oL1?.identity, 1) }}
                style={{ zIndex: zStyle(zL1?.identity) }}
                className="flex flex-col gap-3"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      "relative inline-flex size-[55px] shrink-0",
                      // DROP_SHADOW on span.relative (avatar wrapper)
                      // from spec: offset (0,4), radius 4.
                      "shadow-[0_4px_4px_rgba(0,0,0,0.25)] rounded-full",
                    )}
                  >
                    <Avatar className="size-[55px]">
                      <AvatarImage src={user.image ?? undefined} alt={displayName} />
                      <AvatarFallback className="size-[55px] bg-[color:var(--oh-tint)] font-[family-name:var(--oh-mono)] text-[11px] font-extrabold uppercase tracking-[1px]">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    {/* ::after — 1px ring overlay matching Figma. Lives on
                        top of the image so the ring stays crisp when the
                        avatar image fills the circle. */}
                    {/* B.PT161 — ring color matches spec stroke
                        `#E5E5E5` exactly (was `--oh-line` rgba alpha
                        which composited differently against paper). */}
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-[#E5E5E5]"
                    />
                  </span>
                  {/* B.PT161 — spec is Space Grotesk **Bold** (700) at
                      51.7px / line-height 54.6px / letter-spacing
                      -1.3px. Was `font-black` (900); too heavy. The
                      clamp keeps the type fluid for narrow viewports
                      but caps at 52px which matches the spec exactly.
                      `tracking-[-1.3px]` is the explicit letter-
                      spacing value rather than the loose
                      `tracking-tight`. */}
                  <h1 className="font-sans text-[clamp(32px,1rem+4vw,52px)] font-bold leading-[1.06] tracking-[-1.3px]">
                    {displayName}
                  </h1>
                </div>
                {/* B.PT161 — tagline is text-align CENTER per spec
                    (textAlignHorizontal: CENTER). Was left-default. */}
                <p className="oh-description text-center">{t("defaultBio")}</p>
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
                transition={{ type: "spring", ...(drawerOpen ? openSpring : closeSpring) }}
                initial={{ opacity: oStyle(oL1?.slotList, 1) }}
                animate={{ opacity: oStyle(oL1?.slotList, 1) }}
                exit={{ opacity: oStyle(oL1?.slotList, 1) }}
                style={{ zIndex: zStyle(zL1?.slotList) }}
                className={cn(
                  // B.PT161 — Figma Frame 2 has NO stroke; only the
                  // inner shadow defines the edge. Removed the
                  // `border border-oh-line` that B.PT155 added.
                  "flex flex-col gap-2.5 rounded-[20px] p-[15px]",
                  "bg-[#F5EFDF]",
                  "shadow-[inset_0_0_4px_rgba(0,0,0,0.25)]",
                )}
              >
                {hasOpenSlots ? (
                  <ul className="flex flex-col gap-2.5">
                    {SLOT_OPTIONS.map((opt, i) => (
                      <li key={opt.label}>
                        {/* B.PT162 — `layoutId` wrapper morphs the
                            chip from landing rect (325×50) to phantom
                            rect (690×282) via FLIP transforms. WITHOUT
                            an inner `<motion.div layout>`, the SlotRow
                            content (text + time) would scale 5.6x in
                            paint with the parent's transform, looking
                            stretched mid-flight. With it, motion
                            applies an inverse transform to the inner
                            so its content stays at its CSS dimensions
                            throughout the morph — matches Figma's
                            spec where Frame 6 (left text) and Frame
                            12 (right time) stay at 50px tall during
                            the parent slot's growth to 282px tall. */}
                        <motion.div
                          layoutId={landingLayoutId(`oh-slot-${i}`)}
                          transition={{ type: "spring", ...(drawerOpen ? openSpring : closeSpring) }}
                          initial={{
                            opacity: oStyle(
                              oL1
                                ? [oL1.slot0, oL1.slot1, oL1.slot2, oL1.slot3][i]
                                : undefined,
                              1,
                            ),
                          }}
                          animate={{
                            opacity: oStyle(
                              oL1
                                ? [oL1.slot0, oL1.slot1, oL1.slot2, oL1.slot3][i]
                                : undefined,
                              1,
                            ),
                          }}
                          exit={{
                            opacity: oStyle(
                              oL1
                                ? [oL1.slot0, oL1.slot1, oL1.slot2, oL1.slot3][i]
                                : undefined,
                              1,
                            ),
                          }}
                          style={{
                            zIndex: zStyle(
                              zL1
                                ? [zL1.slot0, zL1.slot1, zL1.slot2, zL1.slot3][i]
                                : undefined,
                            ),
                          }}
                        >
                          {/* B.PT182 — `layout="size"` (was `layout`).
                              Default `layout` (true) tracks BOTH size
                              AND position, so when the parent's
                              layoutId rect morphs, this wrapper sees
                              its own bounding box change (because
                              parent transformed it) and runs an
                              inverse FLIP that includes
                              translation — keeping the SlotRow
                              CONTENT stuck at its previous absolute
                              position while the outer rect moves to
                              modal coords. User saw "outer container
                              moves but chips fade in place."
                              `layout="size"` tracks size only — the
                              wrapper still inverse-corrects the
                              parent's scale (so text doesn't stretch
                              5.6x tall) but lets CSS layout follow
                              the parent's translation, so content
                              moves with the chip. */}
                          <motion.div
                            layout="size"
                            transition={{ type: "spring", ...(drawerOpen ? openSpring : closeSpring) }}
                          >
                            <SlotRow
                              title="intro"
                              description="quick chat, voice only"
                              durationLabel={opt.label}
                              onClick={() => setDrawerOpen(true)}
                            />
                          </motion.div>
                        </motion.div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="oh-description py-6 text-center">
                    {!hasSlots
                      ? t("emptyClosedDescription", { name: displayName })
                      : t("emptyBookedDescription", { name: displayName })}
                  </p>
                )}
              </motion.div>
            </motion.article>
          ) : null}
        </AnimatePresence>
      </div>

      {/* Visitor TZ probe + days-with-slots are computed but not surfaced
          in the new landing layout. They're consumed inside the modal +
          BookingDrawer indirectly via the same store; keep the
          computations alive so the popstate handler + URL sync work. */}
      <span className="sr-only" aria-hidden>
        {visitorTz} · {daysWithOpenSlotsThisWeek} · {nextSlot?.start ?? ""}
      </span>

      {/* B.PT156 — bespoke morphing modal replaces `<AvailabilityDrawer>`
          on this page. `AnimatePresence` keeps the unmounting modal
          alive long enough to morph back into the landing card.
          `popLayout` mode is required on the parent (above) so the
          shared-`layoutId` element transition works across mount/unmount
          boundaries without intermediate jumps. */}
      <AnimatePresence mode="popLayout">
        {hasOpenSlots && drawerOpen ? (
          <HandleModal
            key="handle-modal"
            handle={handle}
            slots={slots}
            open
            onOpenChange={setDrawerOpen}
            selectedDate={selectedDate}
            onSelectDate={handleSelectDate}
            selectedSlot={selectedSlot}
            rescheduleFromUid={rescheduleFromUid}
            onPickSlot={(s) => {
              setSelectedSlot(s);
              updateQueryParam("slot", s.start, { pushEntry: true });
            }}
            // B.PT175 — content rendered inside the modal's
            // `oh-identity` phantom rect (336×87 at 192,22 inside
            // the modal's frame) when keepLandingMounted is on.
            // Mirrors what B.PT172 did for slot rows (phantom rects
            // had no content → user couldn't see chips at
            // destination → SlotRow rendered inside). The identity
            // phantom was skipped in B.PT172 because the user
            // hadn't asked for it yet; surfaced now.
            identityContent={
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "relative inline-flex size-[55px] shrink-0",
                    "shadow-[0_4px_4px_rgba(0,0,0,0.25)] rounded-full",
                  )}
                >
                  <Avatar className="size-[55px]">
                    <AvatarImage
                      src={user.image ?? undefined}
                      alt={displayName}
                    />
                    <AvatarFallback className="size-[55px] bg-[color:var(--oh-tint)] font-[family-name:var(--oh-mono)] text-[11px] font-extrabold uppercase tracking-[1px]">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-[#E5E5E5]"
                  />
                </span>
                <h1 className="font-sans text-[clamp(32px,1rem+4vw,52px)] font-bold leading-[1.06] tracking-[-1.3px]">
                  {displayName}
                </h1>
              </div>
            }
          />
        ) : null}
      </AnimatePresence>
      </LayoutGroup>
    </OhVisitorShell>
  );
}

// 1-to-1 hardcoded slot durations from Figma frame 1 (B.PT155).
// Real multi-event-type wiring is B.PT158 (canonical-win, deferred).
// B.PT172 — exported so `<HandleModal>` can render the same labels
// inside phantom slot rects when `keepLandingMounted` debug is on
// (lets the user see Layer 1 content at its post-morph position).
export const SLOT_OPTIONS = [
  { label: "15 min" },
  { label: "25 min" },
  { label: "30 min" },
  { label: "1 hr" },
] as const;

// Slot row — 325×50 button, paper bg, rounded-14 (Figma cornerRadius).
// Layout: title + description on the left (stacked), duration label on
// the right. Click opens the AvailabilityDrawer (preserved booking flow
// until B.PT156's bespoke modal lands).
// B.PT172 — exported (was a private helper) so the debug overlay
// can render the same chip rendering inside modal phantom rects.
export function SlotRow({
  title,
  description,
  durationLabel,
  onClick,
}: {
  title: string;
  description: string;
  durationLabel: string;
  onClick: () => void;
}) {
  // Split duration label into number + unit so the unit can render at
  // a smaller mono size, matching Figma where "15" is 30px-ish and
  // "min" / "hr" sits at ~15px below the number.
  const match = /^(\d+)\s*(.+)$/.exec(durationLabel);
  const num = match?.[1] ?? durationLabel;
  const unit = match?.[2] ?? "";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        // B.PT161 — Figma slot is 325×50 with paddingLeft=11 (Frame 9
        // sits at x=11, width 303). px-[11px] matches; was `px-3`
        // (12px) which was off by 1px each side.
        "oh-focus-ring group/slot flex h-[50px] w-full items-center justify-between gap-3",
        "rounded-[14px] bg-[color:var(--oh-paper)] px-[11px] text-left",
        // B.PT159 — DROP_SHADOW on each slot row (Figma spec
        // effects[]: offset (0,0), radius 4, color black/0.25).
        "shadow-[0_0_4px_rgba(0,0,0,0.25)]",
        "transition-colors duration-150 ease-oh hover:bg-[color:var(--oh-tint)]",
      )}
    >
      {/* B.PT161 — left text block. Per Figma, both lines are
          textAlignHorizontal=CENTER (despite being left of the
          right-time block). Title "intro" is Space Grotesk Bold 16px
          / line-height 19.2; description "quick chat..." is Regular
          12px / line-height 15. NEITHER has opacity reduction —
          previous `opacity-65` on description was wrong (the FRAME
          parent doesn't have opacity reduction either, only the
          tagline frame does). */}
      <div className="flex min-w-0 flex-col items-center leading-tight">
        <span className="truncate font-sans text-[16px] font-bold leading-[19.2px]">
          {title}
        </span>
        <span className="truncate font-sans text-[12px] font-normal leading-[15px]">
          {description}
        </span>
      </div>
      {/* B.PT161 — right time block. Per Figma each numeric (Bold,
          27.6px, line-height 29.14, letter-spacing -0.69px) sits
          horizontally next to the unit (Regular 12px, line-height
          15). Was 24/11 with bold unit + opacity-65; corrected to
          spec values. `tabular-nums` keeps the digit-width stable
          across the 4 hardcoded options (15/25/30/01). */}
      <div className="flex items-baseline shrink-0 font-sans tabular-nums">
        <span className="text-[27.6px] font-bold leading-[29.14px] tracking-[-0.69px]">
          {num}
        </span>
        {unit ? (
          <span className="ml-1 text-[12px] font-normal leading-[15px]">
            {unit}
          </span>
        ) : null}
      </div>
    </button>
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
