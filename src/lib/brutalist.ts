import {
  CalendarCheck,
  Clock,
  Settings,
  UserRound,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

export const PRIMARY_NAV: NavItem[] = [
  { label: "Bookings", href: "/bookings", icon: CalendarCheck },
  { label: "Availability", href: "/availability", icon: Clock },
  { label: "Profile", href: "/profile", icon: UserRound },
];

export const SECONDARY_NAV: NavItem[] = [
  { label: "Settings", href: "/settings", icon: Settings },
];

export const TICKER_ITEMS: string[] = [
  "OFFICEHOURS · v0.1",
  "BUILT WITH NEXT · TRPC · PRISMA",
  "ONE HOST · ONE VISITOR · ONE BOOKING",
  "REPO · SAFUENTEES/TRPC-LAB",
];

const MONTHS = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
];

export function fmtDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  const mo = MONTHS[d.getMonth()];
  const day = String(d.getDate()).padStart(2, "0");
  return `${mo} · ${day} · ${d.getFullYear()}`;
}
