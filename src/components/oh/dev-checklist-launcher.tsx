"use client";

import { lazy, Suspense, useState } from "react";
import { ListChecksIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ResponsiveModal,
  ResponsiveModalBody,
  ResponsiveModalContent,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
} from "@/components/ui/responsive-modal";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Floating launcher for the admin-only dev checklist (B.PT75). Fixed
// FAB — visible on every host route while authenticated as an admin.
// Clicking opens the ResponsiveModal (Vaul drawer at <md, Base UI
// dialog at md+). The markdown content is lazy-loaded so the 50KB
// react-markdown + remark-gfm bundle only hits the wire when the
// panel actually opens.
//
// As of the 2026-05-02 sweep the launcher renders TWO tabs:
//   - **Recent** — short-form, shipped-this-batch verification
//     checklist (`docs/recent-changes-checklist.md`). Default tab so
//     opening the FAB lands on the freshest list of things to verify
//     manually.
//   - **All features** — the long-form `docs/features-and-tests.md`
//     catalog. Same content as before tabs landed; existing
//     localStorage state is preserved because this tab uses the
//     unscoped (default) storage keys.
//
// If either source markdown is missing (different worktree, partial
// clone) the corresponding tab is skipped. If only one is present
// the launcher falls back to a single-tab layout — no empty TabList.

const DevChecklistContent = lazy(() =>
  import("./dev-checklist-content").then((m) => ({
    default: m.DevChecklistContent,
  })),
);

type TabId = "recent" | "features";

export function DevChecklistLauncher({
  features,
  recent,
}: {
  features: string | null;
  recent: string | null;
}) {
  const [open, setOpen] = useState(false);
  // Default to "recent" when present; otherwise fall back to the long-
  // form catalog. The `value` is also gated by the available tabs
  // below — picking a non-existent tab from prior state would render
  // an empty body, so we always coerce to a present tab.
  const initialTab: TabId = recent !== null ? "recent" : "features";
  const [tab, setTab] = useState<TabId>(initialTab);

  // Render the FAB unconditionally (the server gate already filtered
  // non-admins + the both-files-missing case).
  return (
    <ResponsiveModal open={open} onOpenChange={setOpen}>
      {/* FAB lives top-left, below the dashboard bar (the bar's
          flex slot is `--oh-dashboard-bar-block` ≈ 40px; safe-area
          + a 14px gap puts the button at ~56px from viewport top —
          clear of the bar even on iOS where the notch shifts the
          bar down). On desktop the sidebar's fixed-positioned chrome
          starts at left:0 / width:192px; placing the FAB at left:4
          (16px) lays it OVER the sidebar's footer area, which is
          intentional — the sidebar is sparse there and the FAB at
          z-30 + solid bg reads as a deliberate utility, not an
          accidental overlap. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open dev checklist"
        className="fixed top-14 left-4 z-30 inline-flex size-12 items-center justify-center rounded-full border-2 border-oh-line-strong bg-oh-bg text-oh-content shadow-lg transition-colors duration-150 ease-oh hover:bg-oh-content hover:text-oh-bg sm:top-16 sm:left-6"
      >
        <ListChecksIcon className="size-5" strokeWidth={1.75} />
      </button>

      <ResponsiveModalContent desktopClassName="sm:max-w-3xl">
        <ResponsiveModalHeader>
          <div className="flex items-center justify-between gap-3 pr-3">
            <ResponsiveModalTitle>Dev checklist</ResponsiveModalTitle>
            <Button
              type="button"
              variant="ohGhost"
              size="icon-sm"
              onClick={() => setOpen(false)}
              aria-label="Close"
            >
              <XIcon className="size-4" />
            </Button>
          </div>
        </ResponsiveModalHeader>
        <ResponsiveModalBody>
          {/* Lazy boundary — content chunk loads on first open. The
              scroll container lives INSIDE DevChecklistContent so it
              can save/restore the scrollTop on its own ref (B.PT76).
              Each tab gets its own DevChecklistContent instance with
              a per-tab `storageScope` so the saved checks + scroll
              positions don't bleed between tabs. */}
          <Suspense
            fallback={
              <p className="oh-eyebrow opacity-55">Loading checklist…</p>
            }
          >
            {recent !== null && features !== null ? (
              <Tabs
                value={tab}
                onValueChange={(value) => setTab(value as TabId)}
                className="gap-4"
              >
                <TabsList variant="line" className="self-start">
                  <TabsTrigger value="recent">Recent</TabsTrigger>
                  <TabsTrigger value="features">All features</TabsTrigger>
                </TabsList>
                <TabsContent value="recent">
                  <DevChecklistContent
                    markdown={recent}
                    storageScope="recent"
                  />
                </TabsContent>
                <TabsContent value="features">
                  {/* No `storageScope` so this tab keeps the original
                      B.PT75 storage keys — preserves any existing
                      saved progress across the introduction of tabs. */}
                  <DevChecklistContent markdown={features} />
                </TabsContent>
              </Tabs>
            ) : recent !== null ? (
              <DevChecklistContent markdown={recent} storageScope="recent" />
            ) : features !== null ? (
              <DevChecklistContent markdown={features} />
            ) : null}
          </Suspense>
        </ResponsiveModalBody>
      </ResponsiveModalContent>
    </ResponsiveModal>
  );
}
