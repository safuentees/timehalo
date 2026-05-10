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

// Mobile sidebar mode: content-replace, not Sheet drawer. Below the md
// breakpoint the desktop rail doesn't render (returns null below); the
// dashboard layout renders <MobileNavContent /> inside the content slot
// instead of the page when `openMobile` is true. This avoids the View
// Transitions API stacking conflict (Sheet drawer fighting the page-
// content snapshot for paint order) and matches the iOS-style "menu is
// a page" mental model — the sidebar trigger swaps the content area
// between the current page and the nav.

// Active state: left 2px ink accent + subtle tint bg. Hover: tint bg.
// Matches the original .oh-nav-item aesthetic, driven by data-[active=true]
// attributes set by shadcn's SidebarMenuButton.
//
// Collapsed (icon mode): drop the 2px left border. When the rail
// shrinks to ~32px, even a transparent 2px border-left reserves
// space inside the button's content box and pushes the icon 1px
// right of optical center. Active state in icon mode reads via
// bg tint alone — the left-rail indicator is for the expanded
// state where the label is the scan target.
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
  // Pathname drives BOTH the active-row highlight AND which nav set
  // renders (main app vs. settings sub-nav). Active state must be
  // deferred to post-mount per commit 28a83c3 (Base UI Tooltip useId
  // hydration ordering); the nav SET itself is hydration-safe because
  // usePathname() is deterministic across SSR + first client render,
  // so navGroupsForPath() returns the same array on both passes.
  const pathname = usePathname();
  const mounted = useMounted();
  const { isMobile } = useSidebar();
  const activePath = mounted ? pathname : null;
  const groups = navGroupsForPath(pathname);

  // Mobile: don't render the Sidebar at all (no Sheet drawer). The
  // dashboard layout swaps the content slot to <MobileNavContent />
  // when `openMobile` is true. Until mount, useSidebar's `isMobile`
  // returns false (matches the SSR snapshot of the media query) — so
  // the desktop rail renders during SSR + first client paint and only
  // unmounts once the post-mount media query resolves true. This is
  // the standard SSR-safe pattern documented in `dashboard-forms.md`.
  if (isMobile) {
    return null;
  }

  return (
    <Sidebar
      collapsible="icon"
      // `will-change: width` on the gap + fixed container hints the
      // browser to promote them to a compositor layer for the 200ms
      // collapse transition. Without this, the layout reflow during
      // a thick (2px) brutalist border + position:fixed width
      // animation can drop frames on slower machines, which reads as
      // the sidebar "snapping" instead of sliding.
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

// Mobile content-area nav. Mirrors OhAppSidebar's nav groups but
// without the Sidebar primitive shell (no rail width, no fixed
// positioning, no SidebarMenuButton's icon/expanded duality — at this
// width every row is full-width with the label visible). Rendered by
// OhDashboardLayout inside `oh-host-content-inner` when isMobile &&
// openMobile. Plain Next `Link` here keeps the mobile menu's own GSAP
// exit as the only transition for that mode; desktop page-content fade
// is handled by DashboardTransitionLink in the persistent chrome.
//
// Motion (B.PT52 chisel pass):
// • Single `gsap.timeline({ paused: true })` built once on mount.
//   Played forward for entrance, reversed at timeScale 1.6 for exit
//   — the canonical "leave faster than you arrived" mirror that
//   makes the menu read as a designed unit, not an asymmetrical
//   half-finished one. The exit travels the same distance back to
//   the entrance start state but in ~62% of the entrance time.
// • Hierarchy in motion: group labels (tertiary chrome) get a
//   smaller travel + gentler ease + shorter duration than nav items
//   (the actionable target). Encodes the static design hierarchy in
//   the kinetic dimension. Same stagger cadence so they share
//   rhythm.
// • `gsap.matchMedia()` replaces a one-shot `window.matchMedia`
//   check — handles the user toggling the OS reduce-motion setting
//   mid-session, which the inline check missed.
// • Document-order stagger via the timeline's position parameter
//   (`i * 0.04`), not gsap's `stagger:` option, because we need
//   per-row durations + eases that gsap's stagger doesn't accept as
//   functions. Result: same visual cadence, more control.
//
// Lifecycle: ContentSlot mounts this when openMobile flips true and
// keeps it mounted past openMobile=false until `onExitComplete`
// fires. The `closing` prop drives the timeline direction; toggling
// closing from true→false mid-exit interrupts cleanly (gsap reverses
// the reverse — plays forward from current position).
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
  // B.PT115 — freeze the rendered nav groups at MOUNT time, not on every
  // render. (Originally claimed B.PT104 in the worktree branch where this
  // shipped; renumbered on merge into feat/ui-expose because the
  // parallel agent claimed B.PT104 for the layout-consistency research
  // doc + shipped B.PT105-B.PT114 on top. The merge keeps both branches'
  // rows; this fix's id moved to the next free slot. The branch's
  // commit `4178925` body still references "B.PT104" by name — that
  // reference now points at the layout-consistency row, not this one;
  // resolved by the merge commit's body and the BACKLOG.md row.)
  // Without this, tapping a link from /settings drops the
  // following sequence: (1) Link click triggers route push → pathname
  // updates synchronously to the destination; (2) `navGroupsForPath`
  // recomputes from SETTINGS_NAV_GROUPS → MAIN_NAV_GROUPS while the
  // drawer is still visible; (3) `ContentSlot`'s pathname effect fires
  // `setOpenMobile(false)` → `closing` flips true → exit animation
  // begins. The exit animation runs ~200ms, during which the drawer
  // shows the WRONG (destination-page's) nav groups — visible to the
  // user as a "main app sidebar snapping into place" flash before the
  // route content paints. Snapshotting at mount means the exit
  // animation always plays out with the SAME groups the user was
  // looking at when they tapped the link. Re-opening the drawer on a
  // new route = re-mount = fresh snapshot, so this doesn't stick the
  // groups stale.
  //
  // Pattern reference: dub `apps/web/ui/layout/sidebar/sidebar-nav.tsx
  // :517 (Area)` keeps EVERY area mounted at all times and CSS-toggles
  // visibility per `currentArea` — same principle (don't swap content
  // mid-transition), heavier architecture. Cal.com sidesteps the
  // problem entirely by using a fixed bottom-nav bar (no drawer at
  // all). Our content-slot architecture (B.PT49) sits between those
  // two; freeze-at-mount is the minimal fix that matches the
  // architecture.
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

        // Sync to the wrapper's clip-path reveal in oh-mobile-nav-
        // overlay.tsx (0.55s top-down reveal). GSAP timeline holds
        // a 0.055s lead-in (~10% of the bg reveal) before the first
        // item starts so items don't appear behind a still-rolling
        // curtain — they begin staggering in once the bg has just
        // begun covering the top portion. Reverse plays the same
        // lead-in as a tail at the end (no visible effect —
        // wrapper's clip-path has already shrunk past the rows by
        // then).
        const STAGGER_LEAD_IN = 0.055;
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
            // Position parameter: each row starts at
            // STAGGER_LEAD_IN + i * 0.04s into the timeline.
            // Document-order stagger; reverse plays them out in
            // reverse order automatically.
            STAGGER_LEAD_IN + i * 0.04,
          );
        });
        tlRef.current = tl;
        tl.play();
      });

      mm.add("(prefers-reduced-motion: reduce)", () => {
        // No animation: reduce-motion users see the nav arrive
        // instantly at its natural state. The `closing` effect below
        // also short-circuits exit when no timeline exists, so it
        // calls onExitComplete synchronously when the layout sets
        // closing=true.
        tlRef.current = null;
      });

      return () => mm.revert();
    },
    { scope: container },
  );

  // Drive the timeline's direction from the `closing` prop. Forward
  // play (timescale 1) on mount + on re-open during an in-flight
  // exit; reverse (timescale 1.6) on close. `onReverseComplete` is
  // the unmount signal; the layout removes us from the DOM after.
  useEffect(() => {
    const tl = tlRef.current;
    if (!tl) {
      // Reduced-motion path — no timeline exists. Fire the unmount
      // signal synchronously so the layout doesn't leave us
      // mounted forever.
      if (closing) onExitComplete();
      return;
    }

    if (closing) {
      // Reverse-stagger on close: items translate out / fade FAST so
      // they finish well before the parent overlay's clipPath
      // collapse (0.55s) reaches them. 2.5x timescale → items
      // exit in ~0.2-0.3s, clipPath then sweeps over an empty
      // area. Without this lead, the clipping line catches up to
      // still-animating items and they "snap" rather than gracefully
      // leaving on their own.
      tl.timeScale(2.5);
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
      // Marker for the View Transitions opt-out rule in globals.css.
      // When this nav is mounted, `:has([data-oh-mobile-menu="true"])`
      // drops `oh-host-content-inner`'s view-transition-name so the
      // route-change cross-fade doesn't conflict with the GSAP exit
      // animation. Same structural pattern as commit 898cef8 used for
      // the Sheet drawer; selector updated for the inline-menu case.
      data-oh-mobile-menu="true"
      // Frosted-glass surface — the iOS / OS-style "frosty glass"
      // recipe per Google web.dev "OS-style backgrounds" + Apple HIG:
      //
      //   1. `bg-oh-paper/78` — semi-transparent bg. Backdrop-filter
      //      on an opaque bg is a silent no-op; the spec needs
      //      something to "see through" to. 78% paper keeps the nav
      //      legible while the underlying surface still varies the
      //      blur.
      //   2. `supports-backdrop-filter:backdrop-blur-xl` — 24px
      //      blur, the iOS-sidebar magnitude. The
      //      `supports-backdrop-filter:` Tailwind variant generates
      //      `@supports (backdrop-filter: ...) { ... }` so browsers
      //      without the property see the bg-color directly (no
      //      polyfill needed; clean degradation).
      //   3. `supports-backdrop-filter:backdrop-saturate-150` —
      //      restores color vibrancy the blur otherwise washes
      //      out. Pairs blur with the iOS "vibrant material" feel.
      //   4. `relative z-0 transform-gpu` — Safari requires a
      //      stacking context on the blurred element OR
      //      backdrop-filter no-ops silently. `transform-gpu`
      //      promotes to a GPU layer so the blur is cheap during
      //      stagger entry / scroll.
      //
      // Tailwind v4 emits both `backdrop-filter` AND
      // `-webkit-backdrop-filter` for the same utility, so Safari
      // < 17 (which still needs the prefix) gets the effect for
      // free without manual prefix work.
      //
      // Architectural note: the mobile nav is content-replace
      // (replaces the page body inside the dashboard panel rather
      // than overlaying it). When the nav fills a uniform paper
      // panel, the blur has no varied content to render against
      // and looks identical to opaque paper. The recipe is in
      // place + correct; the visual effect activates fully when /
      // if the nav becomes a true overlay. Until then it adds the
      // modern translucent vocabulary that already matches the
      // visitor shell's sticky header.
      className={[
        "flex flex-col gap-6 px-4 py-6 sm:px-6",
        // `relative` lifts content above the absolute bg layer
        // sibling in the overlay wrapper (oh-mobile-nav-overlay
        // .tsx). DOM order alone would suffice, but explicit
        // positioning prevents any cascade weirdness if the
        // wrapper gains another absolute child.
        "relative z-0",
        // No bg here — the overlay wrapper paints a solid
        // `bg-oh-paper` layer behind the nav as a SLIDING
        // motion.div (slides down on open, up on close). Content
        // itself stays static in its final position; only the
        // background animates. Two-layer split is the canonical
        // "background reveals, content stays" pattern.
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
                      // Transition both colors AND box-shadow so the
                      // shadow lift fades smoothly when the active row
                      // changes via route navigation. ease-oh matches
                      // the rest of the dashboard's motion vocabulary.
                      "transition-[background-color,color,box-shadow] duration-150 ease-oh",
                      "oh-focus-ring",
                      // Hover tint only on inactive rows. The active
                      // row already carries paper-on-paper + drop
                      // shadow; layering hover-tint on top would
                      // wash the chip into the surround on pointer
                      // entry. Gate keeps the active state stable.
                      // Active = paper-on-paper chip with drop shadow
                      // (B.PT289 — match OhPillSwitcher's active pill
                      // vocabulary). Replaces the prior bg-tint-active
                      // + 2px ink left-border combo with a single
                      // unified treatment: the row reads as a paper
                      // card lifted off the page surface, shadow
                      // matching the `oh` button drop
                      // (`0 3px 12px rgba(0,0,0,0.22)`). Same chrome
                      // the active pill chip carries — one design
                      // vocabulary across switchers + nav rows.
                      active
                        ? "bg-[color:var(--oh-paper)] font-bold shadow-[var(--oh-shadow-resting)]"
                        : "hover:bg-[var(--oh-tint-hover)]",
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
            // Active when the route exactly matches OR is a child of
            // the nav target. Lets `/settings/general/whatever` keep
            // the General row lit even on a sub-page. The `/` root
            // exception avoids every row matching when href === "/".
            const active =
              activePath !== null &&
              (activePath === item.href ||
                (item.href !== "/" && activePath.startsWith(`${item.href}/`)));
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

// Sidebar collapse trigger. Bare native button — no Button component,
// no variant baggage, no hover state. Just an icon that toggles.
function FooterControls() {
  const { toggleSidebar, state } = useSidebar();
  const t = useTranslations("Sidebar");
  return (
    <button
      type="button"
      onClick={toggleSidebar}
      aria-label={
        state === "expanded" ? t("collapseSidebar") : t("expandSidebar")
      }
      className="oh-focus-ring inline-flex size-9 items-center justify-center text-oh-ink [&_svg]:size-4"
    >
      <PanelLeft strokeWidth={1.5} />
    </button>
  );
}
