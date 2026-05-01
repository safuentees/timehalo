"use client";

import { useState, useTransition } from "react";
import { Link } from "next-view-transitions";
import { usePathname, useRouter } from "next/navigation";
import { Menu } from "@base-ui/react/menu";
import {
  CalendarCheck,
  Check,
  ChevronDown,
  Plus,
  Settings,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/trpc/hooks";
import { setActiveWorkspace } from "@/lib/active-workspace-actions";
import { nextHrefAfterWorkspaceSwitch } from "@/lib/active-workspace";
import { WorkspaceCreateDialog } from "@/app/(host)/workspaces/components/workspace-create-dialog";
import { OhMenuTrigger } from "./oh-menu-trigger";
import { OhUserMenu } from "./user-menu";

export function OhDashboardBar() {
  const { data: workspaces } = trpc.workspaces.list.useQuery();
  const router = useRouter();
  const pathname = usePathname();
  const [createOpen, setCreateOpen] = useState(false);
  const [, startTransition] = useTransition();
  const utils = trpc.useUtils();

  const current = workspaces?.find((w) => w.isActive) ?? workspaces?.[0];
  const label = current?.name ?? "Workspaces";

  function handlePick(slug: string) {
    const oldSlug = current?.slug;
    startTransition(async () => {
      const result = await setActiveWorkspace({ slug });
      if (!result.ok) {
        toast.error("Couldn't switch workspace.");
        return;
      }
      await utils.invalidate();
      router.refresh();
      const next = oldSlug
        ? nextHrefAfterWorkspaceSwitch(pathname ?? "", oldSlug, slug)
        : null;
      if (next) router.push(next);
    });
  }

  return (
    <div className="oh-dashboard-bar">
      <OhMenuTrigger className="-ml-1 mr-1 md:hidden" />
      <Menu.Root>
        <Menu.Trigger
          id="oh-workspace-switcher-trigger"
          className="oh-dashboard-bar-trigger"
          type="button"
        >
          <span className="oh-dashboard-bar-label">{label}</span>
          <ChevronDown
            aria-hidden
            strokeWidth={1.75}
            className="oh-dashboard-bar-chevron size-3 opacity-55"
          />
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
                  Workspaces
                </Menu.GroupLabel>
                {(workspaces ?? []).map((w) => (
                  <Menu.Item
                    key={w.id}
                    className="oh-menu-item"
                    onClick={() => handlePick(w.slug)}
                  >
                    <span className="oh-menu-item-glyph">
                      {w.isActive ? (
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
                ))}
              </Menu.Group>

              <Menu.Separator className="oh-menu-separator" />

              <Menu.Item
                className="oh-menu-item"
                onClick={() => setCreateOpen(true)}
              >
                <span className="oh-menu-item-glyph">
                  <Plus aria-hidden strokeWidth={1.75} className="size-4" />
                </span>
                <span>Create workspace</span>
              </Menu.Item>
              <Menu.Item
                className="oh-menu-item"
                render={<Link href="/workspaces" />}
              >
                <span className="oh-menu-item-glyph">
                  <Settings aria-hidden strokeWidth={1.75} className="size-4" />
                </span>
                <span>Manage workspaces</span>
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>

      <div className="flex items-center gap-2">
        <ChromeIconLink href="/bookings" label="Bookings" icon={CalendarCheck} />
        <ChromeIconLink href="/settings" label="Settings" icon={Settings} />
        <OhUserMenu />
      </div>

      <WorkspaceCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
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
    <Link
      href={href}
      aria-label={label}
      className="group/chrome inline-flex size-7 items-center justify-center rounded-(--oh-r-xs) text-[color:var(--oh-ink)] transition-colors duration-150 ease-oh hover:bg-[var(--oh-tint-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--oh-ink)] focus-visible:outline-offset-2 [&_svg]:opacity-[0.55] [&_svg]:transition-opacity [&_svg]:duration-150 [&_svg]:ease-oh group-hover/chrome:[&_svg]:opacity-100 hover:[&_svg]:opacity-100"
    >
      <Icon aria-hidden strokeWidth={1.75} className="size-4" />
    </Link>
  );
}
