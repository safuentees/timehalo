"use client";

import { type ComponentProps, type CSSProperties } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

type CornerRadiusStyle = Pick<
  CSSProperties,
  | "borderTopLeftRadius"
  | "borderTopRightRadius"
  | "borderBottomRightRadius"
  | "borderBottomLeftRadius"
>;

type CornerRadiusValue = CSSProperties["borderTopLeftRadius"];

// Motion's shared-layout mixer prioritizes per-corner latestValues over
// borderRadius shorthand. Keep all shared morph nodes on explicit longhands
// so stale 0px corners from a previous projection can't win the next morph.
export function cornerRadiusStyle(
  topLeft: CornerRadiusValue,
  topRight: CornerRadiusValue = topLeft,
  bottomRight: CornerRadiusValue = topLeft,
  bottomLeft: CornerRadiusValue = topLeft,
): CornerRadiusStyle {
  return {
    borderTopLeftRadius: topLeft,
    borderTopRightRadius: topRight,
    borderBottomRightRadius: bottomRight,
    borderBottomLeftRadius: bottomLeft,
  };
}

// B.PT211 — raw radius numbers exported alongside the styles so
// nested elements can derive concentric corner radii via Apple
// HIG's formula: `inner = outer - margin`. See
// developer.apple.com/design/human-interface-guidelines/live-activities
// — "match its corner radius to the outer corner radius … by
// subtracting the margin." HANDLE_SLOT_LIST_INNER_PADDING is the
// margin between slot-list (cream) and the chip stack, so the
// first/last chip's outer corners get
// HANDLE_SLOT_LIST_RADIUS - HANDLE_SLOT_LIST_INNER_PADDING = 5,
// keeping the chip's outer curve concentric with the cream rect.
export const HANDLE_CARD_RADIUS = 25;
export const HANDLE_SLOT_LIST_RADIUS = 25;
export const HANDLE_SLOT_ROW_RADIUS = 14;
export const HANDLE_SLOT_LIST_INNER_PADDING = 15;
export const HANDLE_SLOT_CONCENTRIC_OUTER_RADIUS = Math.max(
  0,
  HANDLE_SLOT_LIST_RADIUS - HANDLE_SLOT_LIST_INNER_PADDING,
);

export const HANDLE_CARD_RADIUS_STYLE = cornerRadiusStyle(HANDLE_CARD_RADIUS);
export const HANDLE_SLOT_LIST_RADIUS_STYLE = cornerRadiusStyle(
  HANDLE_SLOT_LIST_RADIUS,
);
export const HANDLE_SLOT_ROW_RADIUS_STYLE = cornerRadiusStyle(
  HANDLE_SLOT_ROW_RADIUS,
);

// Per-chip label shape consumed by `SlotRow` + the modal's chrome-row
// meeting-duration title. Fields:
//   • `label`       — compact form. Falls back to "15 min" / "1 hr" when
//                     the host hasn't set a custom title.
//   • `fullLabel`   — sentence-case duration ("15 minutes" / "1 hour").
//                     Used by the modal's chrome-row title even when the
//                     chip displays a custom title — the modal surfaces
//                     "{title} for {fullLabel} on {date} at {time}".
//   • `minutes`     — raw minutes (booking write key + duration math).
//   • `title`       — optional host-customized chip caption (B.PT303).
//                     `null` means "no custom title; show fullLabel as
//                     the chip caption."
//   • `description` — optional host-customized subtitle, surfaced in
//                     the modal's chrome row beneath the meeting title.
export type SlotOption = {
  label: string;
  fullLabel: string;
  minutes: number;
  title: string | null;
  description: string | null;
};

// Translator shape for the chip-label builder. Narrows to the
// `HostProfile` namespace so callers can pass a `useTranslations
// ("HostProfile")` instance directly. Hand-rolled rather than
// `Pick<...>` so consumers don't need to know the exact shape — a
// callable that takes (key, args?) and returns string is enough.
type SlotOptionT = (
  key: string,
  values?: Record<string, string | number>,
) => string;

// B.PT276 — minutes → chip label, localized via next-intl. Replaces
// the hardcoded `SLOT_OPTIONS` constant from B.PT155: hosts now
// configure their `durationMinsList` on /profile (B.PT274), and
// `users.getByHandle` returns the resolved list as `durationChoices`
// (B.PT158). When a host hasn't configured anything, `durationChoices`
// collapses to `[durationMins]` (single chip — same single-duration
// UX as today's hardcoded list pre-B.PT158).
//
// 2026-05-09 — `t` parameter added for full localization. Previously
// the labels were hardcoded English ("15 minutes", "1 hour"); the
// chrome-row title surfaces the `fullLabel` as part of "{duration}
// on {date} at {time}", which an es-locale visitor saw as "15 minutes
// on 9 de mayo at 9:34" — date+time localized, duration + connectors
// stuck in English. Threading `t` through here closes the gap; the
// chrome row's title template gets its own `chromeRowSlotTitle` key
// to localize the "on / at" connectors.
export function minutesToSlotOption(
  option: { minutes: number; title?: string | null; description?: string | null },
  t: SlotOptionT,
): SlotOption {
  const { minutes, title = null, description = null } = option;
  let label: string;
  let fullLabel: string;
  if (minutes < 60) {
    label = t("slotDurationCompactMinutes", { minutes });
    fullLabel = t("slotDurationFullMinutes", { minutes });
  } else {
    const hours = Math.floor(minutes / 60);
    const rem = minutes % 60;
    if (rem === 0) {
      label = t("slotDurationCompactHours", { count: hours });
      fullLabel = t("slotDurationFullHours", { count: hours });
    } else {
      label = t("slotDurationCompactHoursMinutes", { hours, minutes: rem });
      fullLabel = t("slotDurationFullHoursMinutes", { hours, minutes: rem });
    }
  }
  // B.PT303 — host-customized title overrides the chip caption.
  // `fullLabel` keeps the duration form so the modal can render
  // "{title} for {fullLabel}" as a richer chrome-row title.
  return {
    label: title ?? label,
    fullLabel,
    minutes,
    title,
    description,
  };
}

// B.PT276 — fallback slot list used when the host's `durationChoices`
// is somehow empty (defensive — `resolveDurationChoices` already
// collapses to `[durationMins]` so the empty path shouldn't fire in
// production, but keeps the chip strip from rendering 0 rows).
//
// Stays English-only because it's defensive infrastructure, not a
// rendered surface in steady state. If it ever DOES render, the
// caller can swap it for `[minutesToSlotOption(15, t)]` to localize.
export const FALLBACK_SLOT_OPTIONS: ReadonlyArray<SlotOption> = [
  {
    label: "15 min",
    fullLabel: "15 minutes",
    minutes: 15,
    title: null,
    description: null,
  },
];

type SlotRowMotionProps = {
  layoutId?: string;
  transition?: ComponentProps<typeof motion.div>["transition"];
  initial?: ComponentProps<typeof motion.div>["initial"];
  animate?: ComponentProps<typeof motion.div>["animate"];
  exit?: ComponentProps<typeof motion.div>["exit"];
  style?: ComponentProps<typeof motion.div>["style"];
};

// Slot row — 325×50 button, paper bg, rounded-14 (Figma cornerRadius).
// Layout: title + description on the left (stacked), duration label on
// the right. Click opens the AvailabilityDrawer (preserved booking flow
// until B.PT156's bespoke modal lands).
// B.PT172 — shared so the debug overlay can render the same chip
// rendering inside modal phantom rects.
export function SlotRow({
  title,
  description,
  durationLabel,
  onClick,
  inert = false,
  figmaLayer,
  layoutId,
  transition,
  initial,
  animate,
  exit,
  style,
}: {
  title: string;
  description: string;
  durationLabel: string;
  onClick: () => void;
  inert?: boolean;
  figmaLayer?: string;
} & SlotRowMotionProps) {
  // Split duration label into number + unit so the unit can render at
  // a smaller mono size, matching Figma where "15" is 30px-ish and
  // "min" / "hr" sits at ~15px below the number.
  const match = /^(\d+)\s*(.+)$/.exec(durationLabel);
  const num = match?.[1] ?? durationLabel;
  const unit = match?.[2] ?? "";
  const frameClassName = cn(
    // The outer element is Figma's painted `slot` frame. Its direct
    // child below maps to Frame 9: x=11, y=0, h=50, width fills.
    "oh-focus-ring group/slot relative block w-full overflow-hidden bg-[color:var(--oh-paper)] text-left",
    "transition-colors duration-150 ease-oh hover:bg-[color:var(--oh-tint)]",
    // B.PT208 — height split: Layer 1 (interactive, `inert: false`)
    // is a fixed 50px landing pill. Layer 2 (`inert: true` modal
    // phantom) fills its flex-1 wrapper via `h-full` so the chip
    // expands to the chip-area height the modal allocates. Same
    // chip component, different sizing role per mount context.
    inert ? "h-full" : "h-[50px]",
  );
  const frameStyle = {
    ...HANDLE_SLOT_ROW_RADIUS_STYLE,
    boxShadow: "0 0 4px rgba(0,0,0,0.25)",
    ...style,
  };
  // B.PT187 — restore the per-frame layoutIds + opacity pinning that
  // codex/chatgpt originally landed (B.PT184) and that B.PT186 wrongly
  // reverted. Motion source confirms the mechanism: in `mixValues`
  // the path check `!this.path.some(hasOpacityCrossfade)` skips the
  // shared-layout opacity tween on a child when an ANCESTOR already
  // has `opacityExit` set on its animationValues. The outer chip's
  // crossfade always sets opacityExit, so the inner spans' OWN
  // crossfade is suppressed AS LONG AS the inner spans have layoutId
  // (so they're recognized as shared-layout) AND explicit
  // initial/animate/exit opacity pinned to 1 (so motion doesn't fall
  // through to the auto crossfade-in/out branch). Without layoutId
  // (the B.PT186 attempt) the inner spans aren't matched between
  // landing and modal renders — the close direction sees the
  // landing's text spans mount fresh and motion fades them in via the
  // entrance animation, producing the 0.7-progress pop-in glitch the
  // codex prompt called out.
  const frame9LayoutId = layoutId ? `${layoutId}-frame-9` : undefined;
  const textLayoutId = layoutId ? `${layoutId}-frame-17` : undefined;
  const durationLayoutId = layoutId ? `${layoutId}-frame-12` : undefined;
  const content = (
    <motion.span
      layoutId={frame9LayoutId}
      layout
      // B.PT193 — pass the same `transition` prop the outer chip uses,
      // so Frame 9's layout animation respects the Spring tuning
      // duration override (visualDuration). Without this, motion
      // falls through to `defaultLayoutTransition = { duration: 0.45,
      // ease: [0.4, 0, 0.1, 1] }` and the inner morph runs at a
      // fixed 0.45s curve regardless of the user's duration setting
      // — which is why scaling Spring tuning duration to 1.5s or 3s
      // didn't slow down the size animation; it stayed at 0.45s
      // ease, looking like a "snap" relative to the slowed-down
      // outer chip animation.
      transition={transition}
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 1 }}
      // Figma keeps Frame 9 at 50px high while its width fills the
      // growing slot. Giving this direct child its own layout
      // projection lets Motion counter-scale inherited slot stretch.
      // Opacity is pinned so shared-layout close does not crossfade
      // cloned text layers before the chip finishes shrinking.
      className="absolute left-[11px] right-[11px] top-0 flex h-[50px] items-center justify-between gap-3"
    >
      {/* B.PT161 — left text block. B.PT214 — User: "the text that
          is inside 'intro' it's centered it should be justified to
          beginning." Switched cross-axis from `items-center` to
          `items-start` so title + description left-align inside the
          flex column. Figma's `textAlignHorizontal=CENTER` from the
          original spec was already a deliberate departure (the text
          frame is LEFT of the time block visually); the redesigned
          chip reads as a label + value pair, where the label belongs
          at the start of the row. Title is Space Grotesk Bold 16px /
          line-height 19.2; description "quick chat..." is Regular
          12px / line-height 15. */}
      <motion.span
        layoutId={textLayoutId}
        layout="position"
        // B.PT193 — same transition as Frame 9 / outer chip so the
        // text's position animation respects the duration override.
        transition={transition}
        // B.PT190 — left-anchored (default {x:0, y:0}). Text is at
        // Frame 9's left edge via flex; this anchor produces a
        // monotonic leftward translation during the morph that the
        // user observed as smooth. Kept as-is.
        layoutAnchor={{ x: 0, y: 0 }}
        initial={{ opacity: 1 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 1 }}
        // Text should move with the projected row, not scale with it.
        className="flex min-w-0 flex-col items-start leading-tight"
      >
        <span className="truncate font-sans text-[16px] font-bold leading-[19.2px]">
          {title}
        </span>
        <span className="truncate font-sans text-[12px] font-normal leading-[15px]">
          {description}
        </span>
      </motion.span>
      {/* B.PT161 — right time block. Per Figma each numeric (Bold,
          27.6px, line-height 29.14, letter-spacing -0.69px) sits
          horizontally next to the unit (Regular 12px, line-height
          15). Was 24/11 with bold unit + opacity-65; corrected to
          spec values. `tabular-nums` keeps the digit-width stable
          across the 4 hardcoded options (15/25/30/01). */}
      <motion.span
        layoutId={durationLayoutId}
        layout="position"
        // B.PT193 — pass transition so size/position animations
        // respect the Spring tuning duration override.
        transition={transition}
        // B.PT193 — `layoutAnchor={false}` DISABLES relative
        // projection on this element. Per motion-dom d.ts:957:
        // *"`false` disables relative projection entirely."* The
        // tracer revealed duration's screen X dipped non-
        // monotonically during open: 801 → 778 → 768 → ... → 864.
        // Duration first moved LEFT (toward chip center) before
        // reversing RIGHT to track the expanding right edge. That's
        // motion running its OWN per-element layout animation that
        // interpolates duration's relative-to-frame9-LEFT position
        // from landing-context-243 to modal-context-608. Combined
        // with frame9's own FLIP transform, the compound math
        // produces the visible "snap" jolt. Disabling relative
        // projection makes duration follow frame9's transform
        // directly via CSS inheritance (no per-element layout
        // animation), so duration stays at frame9's right edge
        // throughout the morph — matches Figma's auto-layout
        // fill-container behavior the user described. Text keeps
        // its `{x:0, y:0}` anchor because its motion is
        // monotonically leftward and works correctly.
        layoutAnchor={false}
        initial={{ opacity: 1 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 1 }}
        // The duration group rides the right edge as Frame 9 widens.
        className="flex shrink-0 items-baseline font-sans tabular-nums"
      >
        <span className="text-[27.6px] font-bold leading-[29.14px] tracking-[-0.69px]">
          {num}
        </span>
        {unit ? (
          <span className="ml-1 text-[12px] font-normal leading-[15px]">
            {unit}
          </span>
        ) : null}
      </motion.span>
    </motion.span>
  );

  if (inert) {
    return (
      <motion.div
        aria-hidden="true"
        data-oh-figma-layer={figmaLayer}
        layoutId={layoutId}
        transition={transition}
        initial={initial}
        animate={animate}
        exit={exit}
        style={frameStyle}
        className={frameClassName}
      >
        {content}
      </motion.div>
    );
  }

  return (
    <motion.button
      type="button"
      onClick={onClick}
      data-oh-figma-layer={figmaLayer}
      layoutId={layoutId}
      transition={transition}
      initial={initial}
      animate={animate}
      exit={exit}
      style={frameStyle}
      className={frameClassName}
    >
      {content}
    </motion.button>
  );
}
