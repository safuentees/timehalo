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
// B.PT100 generalized the fixed-2-tab launcher (B.PT87) into a
// per-tab array so adding a new pass-checklist (e.g. 2026-05-03) is
// a one-line edit in `DevChecklistMount` rather than a launcher
// refactor. Each tab carries its own `storageScope` for per-tab
// localStorage isolation. Order in the array = tab order in the
// modal; the launcher defaults to the FIRST tab present, so adding
// a new pass at index 0 makes it the default surface.
//
// If a tab's markdown is missing (different worktree, partial
// clone) `DevChecklistMount` skips it; the launcher renders only
// what it received. Single-tab fallback (no Tabs primitive) when
// there's exactly one to avoid a dangling pillbar.

const DevChecklistContent = lazy(() =>
  import("./dev-checklist-content").then((m) => ({
    default: m.DevChecklistContent,
  })),
);

export type ChecklistTab = {
  /** Stable identifier for the Tabs primitive value + storage key. */
  id: string;
  /** Visible tab label. */
  label: string;
  /** Markdown source loaded server-side by `DevChecklistMount`. */
  markdown: string;
  /** Per-tab localStorage scope. Omit for the unscoped (default)
      keys — used by the long-form `All features` tab to preserve
      existing user state from before B.PT87 split things into tabs. */
  storageScope?: string;
};

export function DevChecklistLauncher({ tabs }: { tabs: ChecklistTab[] }) {
  const [open, setOpen] = useState(false);
  // Default to the first tab present. `DevChecklistMount` orders
  // newest-first, so this lands the user on the freshest pass.
  const [activeTab, setActiveTab] = useState<string>(tabs[0]?.id ?? "");

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
            {tabs.length > 1 ? (
              <Tabs
                value={activeTab}
                onValueChange={setActiveTab}
                className="gap-4"
              >
                <TabsList variant="line" className="self-start">
                  {tabs.map((tab) => (
                    <TabsTrigger key={tab.id} value={tab.id}>
                      {tab.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {tabs.map((tab) => (
                  <TabsContent key={tab.id} value={tab.id}>
                    <DevChecklistContent
                      markdown={tab.markdown}
                      storageScope={tab.storageScope}
                    />
                  </TabsContent>
                ))}
              </Tabs>
            ) : tabs.length === 1 ? (
              <DevChecklistContent
                markdown={tabs[0].markdown}
                storageScope={tabs[0].storageScope}
              />
            ) : null}
          </Suspense>
        </ResponsiveModalBody>
      </ResponsiveModalContent>
    </ResponsiveModal>
  );
}
