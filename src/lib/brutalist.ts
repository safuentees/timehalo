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
  labelKey: string;
  href: string;
  icon: LucideIcon;
};

export type NavGroup = {
  labelKey?: string;
  items: NavItem[];
};

export const MAIN_NAV_GROUPS: NavGroup[] = [
  {
    items: [{ labelKey: "bookings", href: "/bookings", icon: CalendarCheck }],
  },
  {
    labelKey: "library",
    items: [
      { labelKey: "availability", href: "/availability", icon: Clock },
      { labelKey: "profile", href: "/profile", icon: UserRound },
      { labelKey: "workspaces", href: "/workspaces", icon: Users },
    ],
  },
];

export const SETTINGS_NAV_GROUPS: NavGroup[] = [
  {
    items: [{ labelKey: "backToApp", href: "/bookings", icon: ArrowLeft }],
  },
  {
    labelKey: "account",
    items: [
      { labelKey: "general", href: "/settings/general", icon: SlidersHorizontal },
      { labelKey: "workflows", href: "/settings/workflows", icon: Workflow },
      { labelKey: "calendars", href: "/settings/calendars", icon: CalendarRange },
    ],
  },
  {
    labelKey: "workspace",
    items: [
      { labelKey: "developer", href: "/settings/developer", icon: KeyRound },
      { labelKey: "billing", href: "/settings/billing", icon: CreditCard },
    ],
  },
  {
    labelKey: "danger",
    items: [{ labelKey: "deleteAccount", href: "/settings/danger", icon: Skull }],
  },
];

export function navGroupsForPath(pathname: string | null): NavGroup[] {
  if (pathname && pathname.startsWith("/settings")) return SETTINGS_NAV_GROUPS;
  return MAIN_NAV_GROUPS;
}
