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

export type ChecklistTab = {
  id: string;
  label: string;
  markdown: string;
  storageScope?: string;
};

export function DevChecklistLauncher({ tabs }: { tabs: ChecklistTab[] }) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>(tabs[0]?.id ?? "");

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
