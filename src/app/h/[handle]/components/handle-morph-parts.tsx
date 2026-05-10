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

export type SlotOption = {
  label: string;
  fullLabel: string;
  minutes: number;
  title: string | null;
  description: string | null;
};

type SlotOptionT = (
  key: string,
  values?: Record<string, string | number>,
) => string;

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
  return {
    label: title ?? label,
    fullLabel,
    minutes,
    title,
    description,
  };
}

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
  const match = /^(\d+)\s*(.+)$/.exec(durationLabel);
  const num = match?.[1] ?? durationLabel;
  const unit = match?.[2] ?? "";
  const frameClassName = cn(
    "oh-focus-ring group/slot relative block w-full overflow-hidden bg-[color:var(--oh-paper)] text-left",
    "transition-colors duration-150 ease-oh hover:bg-[color:var(--oh-tint)]",
    inert ? "h-full" : "h-[50px]",
  );
  const frameStyle = {
    ...HANDLE_SLOT_ROW_RADIUS_STYLE,
    boxShadow: "0 0 4px rgba(0,0,0,0.25)",
    ...style,
  };
  const frame9LayoutId = layoutId ? `${layoutId}-frame-9` : undefined;
  const textLayoutId = layoutId ? `${layoutId}-frame-17` : undefined;
  const durationLayoutId = layoutId ? `${layoutId}-frame-12` : undefined;
  const content = (
    <motion.span
      layoutId={frame9LayoutId}
      layout
      transition={transition}
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 1 }}
      className="absolute left-[11px] right-[11px] top-0 flex h-[50px] items-center justify-between gap-3"
    >
      <motion.span
        layoutId={textLayoutId}
        layout="position"
        transition={transition}
        layoutAnchor={{ x: 0, y: 0 }}
        initial={{ opacity: 1 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 1 }}
        className="flex min-w-0 flex-col items-start leading-tight"
      >
        <span className="truncate font-sans text-[16px] font-bold leading-[19.2px]">
          {title}
        </span>
        <span className="truncate font-sans text-[12px] font-normal leading-[15px]">
          {description}
        </span>
      </motion.span>
      <motion.span
        layoutId={durationLayoutId}
        layout="position"
        transition={transition}
        layoutAnchor={false}
        initial={{ opacity: 1 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 1 }}
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
