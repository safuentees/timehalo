"use client";

import { useState, useTransition } from "react";
import { Link } from "next-view-transitions";
import { Menu } from "@base-ui/react/menu";
import { useTheme } from "next-themes";
import { useLocale, useTranslations } from "next-intl";
import { signOut } from "next-auth/react";
import {
  Activity,
  ArrowUpRight,
  Check,
  ChevronRight,
  Globe,
  LogOut,
  Monitor,
  Moon,
  Settings,
  ShieldCheck,
  Sun,
  UserRound,
} from "lucide-react";
import { trpc } from "@/trpc/hooks";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useMounted } from "@/hooks/use-mounted";
import {
  LOCALES,
  LOCALE_LABELS,
  isLocale,
  type Locale,
} from "@/i18n/locales";
import { setLocaleAction } from "@/i18n/actions";

const THEMES = ["system", "light", "dark"] as const;

function isThemeValue(v: unknown): v is (typeof THEMES)[number] {
  return v === "system" || v === "light" || v === "dark";
}

function initialsFor(name: string | null, email: string | null): string {
  const source = (name ?? email ?? "").trim();
  if (!source) return "?";
  const tokens = source.split(/[\s@.]+/).filter(Boolean);
  const first = tokens[0]?.[0] ?? "";
  const last = tokens.length > 1 ? (tokens[tokens.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
}

export function OhUserMenu() {
  const t = useTranslations("UserMenu");
  const { data: me } = trpc.users.me.useQuery();
  const mounted = useMounted();

  const name = me?.name ?? null;
  const email = me?.email ?? null;
  const handle = me?.handle ?? null;
  const image = me?.image ?? null;
  const initials = initialsFor(name, email);
  const labelName =
    name?.trim() || (email ? email.split("@")[0] : null) || t("fallbackName");

  return (
    <Menu.Root>
      <Menu.Trigger
        className="oh-user-menu-trigger"
        type="button"
        aria-label={t("trigger", { name: labelName })}
      >
        <Avatar size="sm" className="oh-user-menu-avatar">
          {image ? (
            <AvatarImage src={image} alt="" />
          ) : null}
          <AvatarFallback className="bg-[var(--oh-tint-active)] text-[10px] font-extrabold tracking-[0.5px] text-[var(--oh-ink)]">
            {mounted ? initials : ""}
          </AvatarFallback>
        </Avatar>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner
          className="oh-menu-positioner"
          sideOffset={8}
          align="end"
          alignOffset={-4}
          style={{ zIndex: 100 }}
        >
          <Menu.Popup className="oh-menu-popup oh-menu-popup--user">
            <UserMenuHeader
              name={labelName}
              email={email}
              handle={handle}
              image={image}
              initials={initials}
              ready={mounted}
            />

            <Menu.Separator className="oh-menu-separator" />

            <Menu.Group>
              <Menu.GroupLabel className="oh-menu-label">
                {t("accountGroup")}
              </Menu.GroupLabel>
              <Menu.Item
                className="oh-menu-item"
                render={<Link href="/profile" />}
              >
                <span className="oh-menu-item-glyph">
                  <UserRound aria-hidden strokeWidth={1.75} className="size-4" />
                </span>
                <span>{t("profile")}</span>
              </Menu.Item>
              <Menu.Item
                className="oh-menu-item"
                render={<Link href="/settings" />}
              >
                <span className="oh-menu-item-glyph">
                  <Settings aria-hidden strokeWidth={1.75} className="size-4" />
                </span>
                <span>{t("settings")}</span>
              </Menu.Item>
            </Menu.Group>

            <Menu.Separator className="oh-menu-separator" />

            <Menu.Group>
              <Menu.GroupLabel className="oh-menu-label">
                {t("preferencesGroup")}
              </Menu.GroupLabel>
              <ThemeSubmenu />
              <LanguageSubmenu />
            </Menu.Group>

            <Menu.Separator className="oh-menu-separator" />

            <Menu.Group>
              <Menu.Item
                className="oh-menu-item"
                render={<Link href="/status" />}
              >
                <span className="oh-menu-item-glyph">
                  <Activity
                    aria-hidden
                    strokeWidth={1.75}
                    className="size-4"
                  />
                </span>
                <span>{t("systemStatus")}</span>
              </Menu.Item>
              {me?.isAdmin ? (
                <Menu.Item
                  className="oh-menu-item"
                  render={<Link href="/admin" />}
                >
                  <span className="oh-menu-item-glyph">
                    <ShieldCheck
                      aria-hidden
                      strokeWidth={1.75}
                      className="size-4"
                    />
                  </span>
                  <span>{t("adminConsole")}</span>
                </Menu.Item>
              ) : null}
            </Menu.Group>

            <Menu.Separator className="oh-menu-separator" />

            <Menu.Item
              className="oh-menu-item oh-menu-item--destructive"
              onClick={() => {
                void signOut({ callbackUrl: "/" });
              }}
            >
              <span className="oh-menu-item-glyph">
                <LogOut aria-hidden strokeWidth={1.75} className="size-4" />
              </span>
              <span>{t("signOut")}</span>
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

function UserMenuHeader({
  name,
  email,
  handle,
  image,
  initials,
  ready,
}: {
  name: string;
  email: string | null;
  handle: string | null;
  image: string | null;
  initials: string;
  ready: boolean;
}) {
  const t = useTranslations("UserMenu");
  return (
    <div className="oh-user-menu-header">
      <Avatar size="lg" className="shrink-0">
        {image ? <AvatarImage src={image} alt="" /> : null}
        <AvatarFallback className="bg-[var(--oh-tint-active)] text-[12px] font-extrabold tracking-[0.5px] text-[var(--oh-ink)]">
          {ready ? initials : ""}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="oh-user-menu-name">{name}</div>
        {email ? <div className="oh-user-menu-email">{email}</div> : null}
        {handle ? (
          <Link
            href={`/h/${handle}`}
            className="oh-user-menu-handle"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span aria-hidden>@</span>
            <span>{handle}</span>
            <ArrowUpRight
              aria-hidden
              strokeWidth={1.75}
              className="size-3 opacity-65"
            />
            <span className="sr-only">{t("openPublicPage")}</span>
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function ThemeSubmenu() {
  const t = useTranslations("UserMenu");
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  const current: (typeof THEMES)[number] =
    mounted && isThemeValue(theme) ? theme : "system";

  return (
    <Menu.SubmenuRoot>
      <Menu.SubmenuTrigger className="oh-menu-item oh-menu-item--submenu">
        <span className="oh-menu-item-glyph">
          <ThemeIcon value={current} />
        </span>
        <span className="flex-1">{t("theme")}</span>
        <span className="oh-menu-submenu-trail">
          <span className="oh-menu-submenu-current">
            {t(themeLabelKey(current))}
          </span>
          <ChevronRight
            aria-hidden
            strokeWidth={1.75}
            className="size-3.5 opacity-65"
          />
        </span>
      </Menu.SubmenuTrigger>
      <Menu.Portal>
        <Menu.Positioner
          className="oh-menu-positioner"
          sideOffset={8}
          alignOffset={-4}
          style={{ zIndex: 110 }}
        >
          <Menu.Popup className="oh-menu-popup oh-menu-popup--submenu">
            <Menu.RadioGroup
              value={current}
              onValueChange={(value) => {
                if (isThemeValue(value)) setTheme(value);
              }}
            >
              {THEMES.map((value) => (
                <Menu.RadioItem
                  key={value}
                  value={value}
                  className="oh-menu-item"
                >
                  <span className="oh-menu-item-glyph">
                    <ThemeIcon value={value} />
                  </span>
                  <span className="flex-1">{t(themeLabelKey(value))}</span>
                  <Menu.RadioItemIndicator className="oh-menu-item-glyph">
                    <Check
                      aria-hidden
                      strokeWidth={2}
                      className="size-3.5"
                    />
                  </Menu.RadioItemIndicator>
                </Menu.RadioItem>
              ))}
            </Menu.RadioGroup>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.SubmenuRoot>
  );
}

function ThemeIcon({ value }: { value: (typeof THEMES)[number] }) {
  if (value === "light")
    return <Sun aria-hidden strokeWidth={1.75} className="size-4" />;
  if (value === "dark")
    return <Moon aria-hidden strokeWidth={1.75} className="size-4" />;
  return <Monitor aria-hidden strokeWidth={1.75} className="size-4" />;
}

function themeLabelKey(value: (typeof THEMES)[number]) {
  return value === "system"
    ? ("themeSystem" as const)
    : value === "light"
      ? ("themeLight" as const)
      : ("themeDark" as const);
}

function LanguageSubmenu() {
  const t = useTranslations("UserMenu");
  const current = useLocale() as Locale;
  const [pending, start] = useTransition();
  const [optimistic, setOptimistic] = useState<Locale | null>(null);
  const value = optimistic ?? current;

  return (
    <Menu.SubmenuRoot>
      <Menu.SubmenuTrigger className="oh-menu-item oh-menu-item--submenu">
        <span className="oh-menu-item-glyph">
          <Globe aria-hidden strokeWidth={1.75} className="size-4" />
        </span>
        <span className="flex-1">{t("language")}</span>
        <span className="oh-menu-submenu-trail">
          <span className="oh-menu-submenu-current">
            {LOCALE_LABELS[value]}
          </span>
          <ChevronRight
            aria-hidden
            strokeWidth={1.75}
            className="size-3.5 opacity-65"
          />
        </span>
      </Menu.SubmenuTrigger>
      <Menu.Portal>
        <Menu.Positioner
          className="oh-menu-positioner"
          sideOffset={8}
          alignOffset={-4}
          style={{ zIndex: 110 }}
        >
          <Menu.Popup className="oh-menu-popup oh-menu-popup--submenu">
            <Menu.RadioGroup
              value={value}
              onValueChange={(next) => {
                if (!isLocale(next)) return;
                setOptimistic(next);
                start(async () => {
                  await setLocaleAction(next);
                });
              }}
            >
              {LOCALES.map((l) => (
                <Menu.RadioItem
                  key={l}
                  value={l}
                  className="oh-menu-item"
                  disabled={pending}
                >
                  <span className="oh-menu-item-glyph" aria-hidden>
                    <span className="text-[10px] font-extrabold uppercase opacity-65">
                      {l}
                    </span>
                  </span>
                  <span className="flex-1">{LOCALE_LABELS[l]}</span>
                  <Menu.RadioItemIndicator className="oh-menu-item-glyph">
                    <Check
                      aria-hidden
                      strokeWidth={2}
                      className="size-3.5"
                    />
                  </Menu.RadioItemIndicator>
                </Menu.RadioItem>
              ))}
            </Menu.RadioGroup>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.SubmenuRoot>
  );
}
