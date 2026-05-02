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

const DevChecklistContent = lazy(() =>
  import("./dev-checklist-content").then((m) => ({
    default: m.DevChecklistContent,
  })),
);

export function DevChecklistLauncher({ markdown }: { markdown: string }) {
  const [open, setOpen] = useState(false);

  return (
    <ResponsiveModal open={open} onOpenChange={setOpen}>
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
          <div className="max-h-[75vh] overflow-y-auto overscroll-contain pr-1 sm:max-h-[70vh]">
            <Suspense
              fallback={
                <p className="oh-eyebrow opacity-55">Loading checklist…</p>
              }
            >
              <DevChecklistContent markdown={markdown} />
            </Suspense>
          </div>
        </ResponsiveModalBody>
      </ResponsiveModalContent>
    </ResponsiveModal>
  );
}
