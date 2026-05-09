"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { PanelLeft } from "lucide-react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { useMounted } from "@/hooks/use-mounted";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { navGroupsForPath, type NavGroup } from "@/lib/brutalist";
import { DashboardTransitionLink } from "./dashboard-route-transition";

gsap.registerPlugin(useGSAP);

const menuButtonClass = [
  "relative rounded-(--oh-r-xs)",
  "font-sans text-[13.5px] font-medium",
  "gap-[10px] px-[10px] py-[8px]",
  "border-l-2 border-l-transparent",
  "group-data-[collapsible=icon]:border-l-0",
  "transition-colors duration-150 ease-oh",
  "hover:bg-[var(--oh-tint-hover)]",
  "data-[active=true]:bg-[var(--oh-tint-active)]",
  "data-[active=true]:border-l-[var(--oh-ink)]",
  "data-[active=true]:font-bold",
  "oh-focus-ring",
].join(" ");

const groupLabelClass =
  "font-[family:var(--oh-mono)] text-[10px] font-bold tracking-[2.5px] uppercase opacity-55 px-[10px] pb-[8px]";

function sidebarNavId(href: string) {
  const pathname = href.split(/[?#]/)[0] ?? href;
  const slug =
    pathname
      .split("/")
      .filter(Boolean)
      .join("-")
      .replace(/[^a-z0-9-]/gi, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase() || "home";
  return `sidebar-nav-${slug}`;
}

export function OhAppSidebar() {
  const pathname = usePathname();
  const mounted = useMounted();
  const { isMobile } = useSidebar();
  const activePath = mounted ? pathname : null;
  const groups = navGroupsForPath(pathname);

  if (isMobile) {
    return null;
  }

  return (
    <Sidebar
      collapsible="icon"
      className={[
        "oh-app-sidebar",
        "[&_[data-slot=sidebar-gap]]:will-change-[width]",
        "[&_[data-slot=sidebar-container]]:will-change-[width]",
      ].join(" ")}
    >
      <SidebarContent>
        {groups.map((group, index) => (
          <NavGroupRender
            key={group.labelKey ?? `group-${index}`}
            group={group}
            activePath={activePath}
          />
        ))}
      </SidebarContent>

      <SidebarFooter>
        <FooterControls />
      </SidebarFooter>
    </Sidebar>
  );
}

export function MobileNavContent({
  closing,
  onExitComplete,
}: {
  closing: boolean;
  onExitComplete: () => void;
}) {
  const pathname = usePathname();
  const mounted = useMounted();
  const activePath = mounted ? pathname : null;
  const [groups] = useState(() => navGroupsForPath(pathname));
  const container = useRef<HTMLElement>(null);
  const tlRef = useRef<gsap.core.Timeline | null>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const rows = gsap.utils.toArray<HTMLElement>(
          ".oh-mobile-nav-label, .oh-mobile-nav-item",
        );
        if (rows.length === 0) return;

        const tl = gsap.timeline({ paused: true });
        rows.forEach((row, i) => {
          const isLabel = row.classList.contains("oh-mobile-nav-label");
          tl.fromTo(
            row,
            { opacity: 0, y: isLabel ? -4 : -10 },
            {
              opacity: 1,
              y: 0,
              duration: isLabel ? 0.22 : 0.28,
              ease: isLabel ? "power1.out" : "power3.out",
            },
            i * 0.04,
          );
        });
        tlRef.current = tl;
        tl.play();
      });

      mm.add("(prefers-reduced-motion: reduce)", () => {
        tlRef.current = null;
      });

      return () => mm.revert();
    },
    { scope: container },
  );

  useEffect(() => {
    const tl = tlRef.current;
    if (!tl) {
      if (closing) onExitComplete();
      return;
    }

    if (closing) {
      tl.timeScale(1.6);
      tl.eventCallback("onReverseComplete", onExitComplete);
      tl.reverse();
    } else {
      tl.timeScale(1);
      tl.eventCallback("onReverseComplete", null);
      tl.play();
    }
  }, [closing, onExitComplete]);

  const t = useTranslations("Sidebar");
  return (
    <nav
      ref={container}
      aria-label={t("mainNavAria")}
      data-oh-mobile-menu="true"
      className={[
        "flex flex-col gap-6 px-4 py-6 sm:px-6",
        "relative z-0 transform-gpu",
        "bg-oh-paper/85 supports-backdrop-filter:bg-oh-paper/78",
        "supports-backdrop-filter:backdrop-blur-xl",
        "supports-backdrop-filter:backdrop-saturate-150",
      ].join(" ")}
    >
      {groups.map((group, index) => (
        <div key={group.labelKey ?? `mobile-group-${index}`}>
          {group.labelKey ? (
            <p className="oh-mobile-nav-label oh-eyebrow opacity-55 mb-3">
              {t(group.labelKey)}
            </p>
          ) : null}
          <ul role="list" className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const active =
                activePath !== null &&
                (activePath === item.href ||
                  (item.href !== "/" &&
                    activePath.startsWith(`${item.href}/`)));
              const itemLabel = t(item.labelKey);
              return (
                <li key={item.href} className="oh-mobile-nav-item">
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={[
                      "flex items-center gap-3 rounded-(--oh-r-xs) px-3 py-3 text-[15px] font-medium",
                      "transition-[background-color,color,box-shadow] duration-150 ease-oh",
                      "hover:bg-[var(--oh-tint-hover)]",
                      "oh-focus-ring",
                      active
                        ? "bg-[color:var(--oh-paper)] font-bold shadow-[var(--oh-shadow-resting)]"
                        : "",
                    ].join(" ")}
                  >
                    <item.icon
                      aria-hidden
                      strokeWidth={1.5}
                      className="size-5 shrink-0"
                    />
                    <span>{itemLabel}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function NavGroupRender({
  group,
  activePath,
}: {
  group: NavGroup;
  activePath: string | null;
}) {
  const t = useTranslations("Sidebar");
  return (
    <SidebarGroup>
      {group.labelKey ? (
        <SidebarGroupLabel className={groupLabelClass}>
          {t(group.labelKey)}
        </SidebarGroupLabel>
      ) : null}
      <SidebarGroupContent>
        <SidebarMenu className="gap-0.5">
          {group.items.map((item) => {
            const active =
              activePath !== null &&
              (activePath === item.href ||
                (item.href !== "/" &&
                  activePath.startsWith(`${item.href}/`)));
            const itemLabel = t(item.labelKey);
            return (
              <SidebarMenuItem key={item.href} className="group/item">
                <SidebarMenuButton
                  id={sidebarNavId(item.href)}
                  isActive={active}
                  tooltip={itemLabel}
                  className={menuButtonClass}
                  render={
                    <DashboardTransitionLink href={item.href}>
                      <item.icon
                        aria-hidden
                        strokeWidth={1.5}
                        className="size-4 shrink-0"
                      />
                      <span>{itemLabel}</span>
                    </DashboardTransitionLink>
                  }
                />
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function FooterControls() {
  const { toggleSidebar, state } = useSidebar();
  const t = useTranslations("Sidebar");
  return (
    <button
      type="button"
      onClick={toggleSidebar}
      aria-label={state === "expanded" ? t("collapseSidebar") : t("expandSidebar")}
      className="oh-focus-ring inline-flex size-9 items-center justify-center text-oh-ink [&_svg]:size-4"
    >
      <PanelLeft strokeWidth={1.5} />
    </button>
  );
}
