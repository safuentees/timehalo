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

// Floating launcher for the admin-only dev checklist (B.PT75). Fixed
// bottom-right FAB — visible on every host route while authenticated
// as an admin. Clicking opens the ResponsiveModal (Vaul drawer at <md,
// Base UI dialog at md+). The markdown content is lazy-loaded so the
// 50KB react-markdown + remark-gfm bundle only hits the wire when the
// panel actually opens.
//
// Why not just always render content: the panel renders 700+ lines of
// markdown with checkbox state hydration; lazy load keeps initial
// page render budget intact. Suspense boundary shows a tiny loading
// pill until the chunk arrives.

const DevChecklistContent = lazy(() =>
  import("./dev-checklist-content").then((m) => ({
    default: m.DevChecklistContent,
  })),
);

export function DevChecklistLauncher({ markdown }: { markdown: string }) {
  const [open, setOpen] = useState(false);

  return (
    <ResponsiveModal open={open} onOpenChange={setOpen}>
      {/* Fixed FAB — bottom-right, sits above the page content but
          below modals. Z-index intentionally lower than the dialog
          overlay (which Base UI floats at z-50+) so the active dialog
          covers the FAB instead of the FAB peeking through. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open dev checklist"
        className="fixed bottom-4 right-4 z-30 inline-flex size-12 items-center justify-center rounded-full border-2 border-oh-line-strong bg-oh-bg text-oh-content shadow-lg transition-colors duration-150 ease-oh hover:bg-oh-content hover:text-oh-bg sm:bottom-6 sm:right-6"
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
          {/* Lazy boundary — content chunk loads on first open. */}
          <Suspense
            fallback={
              <p className="oh-eyebrow opacity-55">Loading checklist…</p>
            }
          >
            <DevChecklistContent markdown={markdown} />
          </Suspense>
        </ResponsiveModalBody>
      </ResponsiveModalContent>
    </ResponsiveModal>
  );
}
