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
