export type SlotStatus = "open" | "taken";

export type Slot = {
  start: string;
  end: string;
  status: SlotStatus;
};

export type DayDensity = {
  date: string;
  count: number;
  takenCount: number;
  totalCount: number;
  isFullyBooked: boolean;
  level: 0 | 1 | 2 | 3;
};
