"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Menu } from "@base-ui/react/menu";
import {
  CalendarCheck,
  Check,
  ChevronDown,
  Loader2,
  Plus,
  Settings,
  Slash,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/trpc/hooks";
import { setActiveWorkspace } from "@/lib/active-workspace-actions";
import { nextHrefAfterWorkspaceSwitch } from "@/lib/active-workspace";
import { WorkspaceCreateDialog } from "@/app/(host)/workspaces/components/workspace-create-dialog";
import { DashboardTransitionLink } from "./dashboard-route-transition";
import { OhMenuTrigger } from "./oh-menu-trigger";
import { OhTopProgressBar } from "./oh-top-progress-bar";
import { OhUserMenu } from "./user-menu";
import { usePageTitleValue } from "./page-title-context";
import { motion, AnimatePresence } from "motion/react";

export function OhDashboardBar() {
  const t = useTranslations("Chrome");
  const { data: workspaces } = trpc.workspaces.list.useQuery();
  const router = useRouter();
  const pathname = usePathname();
  const [createOpen, setCreateOpen] = useState(false);
  const [pendingSlug, setPendingSlug] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const utils = trpc.useUtils();
  const title = usePageTitleValue();

  const current = workspaces?.find((w) => w.isActive) ?? workspaces?.[0];
  const pendingWorkspace =
    pendingSlug != null
      ? (workspaces?.find((w) => w.slug === pendingSlug) ?? null)
      : null;
  const label =
    (pendingWorkspace ?? current)?.name ?? t("workspaceSwitcherFallback");

  function handlePick(slug: string) {
    const oldSlug = current?.slug;
    if (oldSlug === slug) return;
    setPendingSlug(slug);
    startTransition(async () => {
      try {
        const result = await setActiveWorkspace({ slug });
        if (!result.ok) {
          toast.error(t("switchWorkspaceError"));
          return;
        }
        await utils.invalidate();
        router.refresh();
        const next = oldSlug
          ? nextHrefAfterWorkspaceSwitch(pathname ?? "", oldSlug, slug)
          : null;
        if (next) router.push(next);
      } finally {
        setPendingSlug(null);
      }
    });
  }

  return (
    <div className="oh-dashboard-bar">
      <OhMenuTrigger className="-ml-1 mr-1 md:hidden" />

      <OhPageTitleSlot
        title={title}
        workspaceMenu={
          <Menu.Root>
            <Menu.Trigger
              id="oh-workspace-switcher-trigger"
              className="oh-dashboard-bar-trigger"
              type="button"
              aria-busy={isPending || undefined}
              data-pending={isPending || undefined}
              data-bar-slot="center"
            >
              <span className="oh-dashboard-bar-label">{label}</span>
              {isPending ? (
                <Loader2
                  aria-hidden
                  strokeWidth={2}
                  className="oh-dashboard-bar-chevron size-3 opacity-55 animate-spin"
                />
              ) : (
                <ChevronDown
                  aria-hidden
                  strokeWidth={1.75}
                  className="oh-dashboard-bar-chevron size-3 opacity-55"
                />
              )}
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Positioner
                className="oh-menu-positioner"
                sideOffset={8}
                align="center"
                style={{ zIndex: 100 }}
              >
                <Menu.Popup className="oh-menu-popup">
                  <Menu.Group>
                    <Menu.GroupLabel className="oh-menu-label">
                      {t("workspaceSwitcherGroupLabel")}
                    </Menu.GroupLabel>
                    {(workspaces ?? []).map((w) => {
                      const isPicked = pendingSlug === w.slug;
                      return (
                        <Menu.Item
                          key={w.id}
                          className="oh-menu-item"
                          disabled={isPending}
                          data-pending={isPicked || undefined}
                          onClick={() => handlePick(w.slug)}
                        >
                          <span className="oh-menu-item-glyph">
                            {isPicked ? (
                              <Loader2
                                aria-hidden
                                strokeWidth={2}
                                className="size-3.5 animate-spin opacity-70"
                              />
                            ) : w.isActive ? (
                              <Check
                                aria-hidden
                                strokeWidth={2}
                                className="size-3.5"
                              />
                            ) : null}
                          </span>
                          <span
                            className={
                              w.isActive
                                ? "font-semibold"
                                : "font-normal opacity-85"
                            }
                          >
                            {w.name}
                          </span>
                        </Menu.Item>
                      );
                    })}
                  </Menu.Group>

                  <Menu.Separator className="oh-menu-separator" />

                  <Menu.Item
                    className="oh-menu-item"
                    onClick={() => setCreateOpen(true)}
                  >
                    <span className="oh-menu-item-glyph">
                      <Plus aria-hidden strokeWidth={1.75} className="size-4" />
                    </span>
                    <span>{t("createWorkspace")}</span>
                  </Menu.Item>
                  <Menu.Item
                    className="oh-menu-item"
                    render={<Link href="/workspaces" />}
                  >
                    <span className="oh-menu-item-glyph">
                      <Settings
                        aria-hidden
                        strokeWidth={1.75}
                        className="size-4"
                      />
                    </span>
                    <span>{t("manageWorkspaces")}</span>
                  </Menu.Item>
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
        }
      />

      <div data-bar-slot="end" className="flex items-center gap-2">
        <ChromeIconLink
          href="/bookings"
          label={t("bookingsAria")}
          icon={CalendarCheck}
        />
        <ChromeIconLink
          href="/settings"
          label={t("settingsAria")}
          icon={Settings}
        />
        <OhUserMenu />
      </div>

      <WorkspaceCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
      <OhTopProgressBar visible={isPending} />
    </div>
  );
}

function ChromeIconLink({
  href,
  label,
  icon: Icon,
}: {
  href: string;
  label: string;
  icon: typeof Settings;
}) {
  return (
    <DashboardTransitionLink
      href={href}
      aria-label={label}
      className="oh-focus-ring group/chrome inline-flex size-7 items-center justify-center rounded-(--oh-r-xs) text-[color:var(--oh-ink)] transition-colors duration-150 ease-oh hover:bg-[var(--oh-tint-hover)] [&_svg]:opacity-[0.55] [&_svg]:transition-opacity [&_svg]:duration-150 [&_svg]:ease-oh group-hover/chrome:[&_svg]:opacity-100 hover:[&_svg]:opacity-100"
    >
      <Icon aria-hidden strokeWidth={1.75} className="size-4" />
    </DashboardTransitionLink>
  );
}

function OhPageTitleSlot({
  title,
  workspaceMenu,
}: {
  title: string | null;
  workspaceMenu: React.ReactNode;
}) {
  return (
    <div
      data-bar-slot="title"
      className="flex min-w-0 flex-1 items-center justify-start"
    >
      <motion.div
        initial={false}
        animate={{ opacity: 1 }}
        className="flex min-w-0 items-center"
      >
        {workspaceMenu}
        <AnimatePresence mode="wait" initial={false}>
          {title ? (
            <motion.div
              key="title-segment"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
              className="hidden min-w-0 items-center md:flex"
            >
              <Slash
                aria-hidden
                strokeWidth={2}
                className="size-3 shrink-0 opacity-35"
              />
              <span className="oh-dashboard-bar-pill min-w-0 flex items-center">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={title}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
                    className="oh-dashboard-bar-label truncate"
                  >
                    {title}
                  </motion.span>
                </AnimatePresence>
              </span>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
