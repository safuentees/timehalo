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

// Host-side primary navigation. Mirrors what the host actually does:
// look at incoming bookings, edit availability, edit their public
// profile. "Dashboard" is a developer word; we use noun-based routes.
export const PRIMARY_NAV: NavItem[] = [
  { label: "Bookings", href: "/bookings", icon: CalendarCheck },
  { label: "Availability", href: "/availability", icon: Clock },
  { label: "Profile", href: "/profile", icon: UserRound },
];

export const SECONDARY_NAV: NavItem[] = [
  { label: "Settings", href: "/settings", icon: Settings },
];

// Officehours-flavoured ticker — replaces the writing-app strings.
// Keep it short, evocative, in the brutalist mono uppercase voice.
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
