"use client";

import { type ReactNode } from "react";
import {
  AnimatePresence,
  LayoutGroup,
  SwitchLayoutGroupContext,
} from "motion/react";

const PRESERVE_SHARED_FOLLOW_OPACITY = {
  shouldPreserveFollowOpacity: () => true,
};

export function HostRouteMotionShell({
  children,
  receipt,
}: {
  children: ReactNode;
  receipt: ReactNode;
}) {
  return (
    <SwitchLayoutGroupContext.Provider value={PRESERVE_SHARED_FOLLOW_OPACITY}>
      <LayoutGroup>
        {children}
        <AnimatePresence mode="popLayout" initial={false}>
          {receipt}
        </AnimatePresence>
      </LayoutGroup>
    </SwitchLayoutGroupContext.Provider>
  );
}
