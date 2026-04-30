import {
  ArrowLeft,
  CalendarCheck,
  CalendarRange,
  Clock,
  CreditCard,
  KeyRound,
  Skull,
  SlidersHorizontal,
  UserRound,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

export type NavGroup = {
  label?: string;
  items: NavItem[];
};

export const MAIN_NAV_GROUPS: NavGroup[] = [
  {
    items: [{ label: "Bookings", href: "/bookings", icon: CalendarCheck }],
  },
  {
    label: "LIBRARY",
    items: [
      { label: "Availability", href: "/availability", icon: Clock },
      { label: "Profile", href: "/profile", icon: UserRound },
      { label: "Workspaces", href: "/workspaces", icon: Users },
    ],
  },
];

export const SETTINGS_NAV_GROUPS: NavGroup[] = [
  {
    items: [{ label: "Back to app", href: "/bookings", icon: ArrowLeft }],
  },
  {
    label: "ACCOUNT",
    items: [
      { label: "General", href: "/settings/general", icon: SlidersHorizontal },
      { label: "Workflows", href: "/settings/workflows", icon: Workflow },
      { label: "Calendars", href: "/settings/calendars", icon: CalendarRange },
    ],
  },
  {
    label: "WORKSPACE",
    items: [
      { label: "Developer", href: "/settings/developer", icon: KeyRound },
      { label: "Billing", href: "/settings/billing", icon: CreditCard },
    ],
  },
  {
    label: "DANGER",
    items: [{ label: "Delete account", href: "/settings/danger", icon: Skull }],
  },
];

export function navGroupsForPath(pathname: string | null): NavGroup[] {
  if (pathname && pathname.startsWith("/settings")) return SETTINGS_NAV_GROUPS;
  return MAIN_NAV_GROUPS;
}
