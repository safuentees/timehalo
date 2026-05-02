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
  const initialTab: TabId = recent !== null ? "recent" : "features";
  const [tab, setTab] = useState<TabId>(initialTab);

  return (
    <ResponsiveModal open={open} onOpenChange={setOpen}>
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
