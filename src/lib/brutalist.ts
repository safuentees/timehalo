import {
  Home,
  FileEdit,
  Archive,
  Tag,
  BarChart3,
  Settings,
  Waves,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

export const PRIMARY_NAV: NavItem[] = [
  { label: "Home", href: "/", icon: Home },
  { label: "Drafts", href: "/drafts", icon: FileEdit },
  { label: "Archive", href: "/archive", icon: Archive },
  { label: "Tags", href: "/tags", icon: Tag },
];

export const SECONDARY_NAV: NavItem[] = [
  { label: "Analytics", href: "/analytics", icon: BarChart3 },
  { label: "Settings", href: "/settings", icon: Settings },
];

export const LAB_NAV: NavItem[] = [
  { label: "Halftone", href: "/lab/halftone", icon: Waves },
];

export const TICKER_ITEMS: string[] = [
  "NOW READING · RETHINKING STATE MACHINES",
  "BUILT WITH NEXT · TRPC · PRISMA",
  "DRAFTS · 03 PENDING",
  "STREAK · 11 DAYS",
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
