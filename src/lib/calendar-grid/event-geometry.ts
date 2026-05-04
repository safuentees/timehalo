
import type { CalendarEvent } from "./types";

export type GridPositionOptions = {
  startHour: number;
  endHour: number;
  oneMinuteHeightPx: number;
  minHeightPx?: number;
};

export type EventGridPosition =
  | { isVisible: false }
  | {
      isVisible: true;
      top: number;
      height: number;
      clippedTop: boolean;
      clippedBottom: boolean;
    };

const DEFAULT_MIN_HEIGHT_PX = 18;

export function eventToGridPosition(
  event: CalendarEvent,
  opts: GridPositionOptions,
): EventGridPosition {
  const {
    startHour,
    endHour,
    oneMinuteHeightPx,
    minHeightPx = DEFAULT_MIN_HEIGHT_PX,
  } = opts;
  const totalMinutes = (endHour - startHour + 1) * 60;

  const eventStartMin =
    (event.start.getHours() - startHour) * 60 + event.start.getMinutes();
  const eventEndMin =
    (event.end.getHours() - startHour) * 60 + event.end.getMinutes();

  if (eventEndMin <= 0 || eventStartMin >= totalMinutes) {
    return { isVisible: false };
  }

  const clippedStartMin = Math.max(0, eventStartMin);
  const clippedEndMin = Math.min(totalMinutes, eventEndMin);
  const clippedDurationMin = clippedEndMin - clippedStartMin;

  return {
    isVisible: true,
    top: clippedStartMin * oneMinuteHeightPx,
    height: Math.max(minHeightPx, clippedDurationMin * oneMinuteHeightPx),
    clippedTop: eventStartMin < 0,
    clippedBottom: eventEndMin > totalMinutes,
  };
}

export function pixelToTime(
  yPx: number,
  date: Date,
  opts: Pick<GridPositionOptions, "startHour" | "oneMinuteHeightPx">,
): Date {
  const { startHour, oneMinuteHeightPx } = opts;
  const minutesFromStart = yPx / oneMinuteHeightPx;
  const totalMinutes = startHour * 60 + minutesFromStart;
  const hour = Math.floor(totalMinutes / 60);
  const minute = Math.round(totalMinutes - hour * 60);
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    hour,
    minute,
    0,
    0,
  );
}

export function snapPixelToGrid(
  yPx: number,
  opts: Pick<GridPositionOptions, "oneMinuteHeightPx"> & {
    stepMinutes?: number;
  },
): number {
  const { oneMinuteHeightPx, stepMinutes = 15 } = opts;
  const stepPx = stepMinutes * oneMinuteHeightPx;
  return Math.round(yPx / stepPx) * stepPx;
}
