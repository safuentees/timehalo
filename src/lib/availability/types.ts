export type Slot = { start: string; end: string };

export type DayDensity = {
  date: string;
  count: number;
  level: 0 | 1 | 2 | 3;
};
