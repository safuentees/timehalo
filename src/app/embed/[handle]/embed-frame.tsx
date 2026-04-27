"use client";

import { useEffect, useRef } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/trpc/router";
import HostProfile from "@/app/h/[handle]/components/host-profile";

type RouterOutputs = inferRouterOutputs<AppRouter>;

export function EmbedFrame({
  handle,
  initialUser,
  initialSlots,
  renderedAt,
}: {
  handle: string;
  initialUser: RouterOutputs["users"]["getByHandle"];
  initialSlots: RouterOutputs["schedule"]["getUpcomingSlots"];
  renderedAt: string;
}) {
  const lastHeightRef = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.parent.postMessage(
      { originator: "OH", type: "ready", handle },
      "*",
    );

    const observer = new ResizeObserver(() => {
      const h = document.documentElement.scrollHeight;
      if (Math.abs(h - lastHeightRef.current) < 4) return;
      lastHeightRef.current = h;
      window.parent.postMessage(
        { originator: "OH", type: "size", height: h, handle },
        "*",
      );
    });
    observer.observe(document.documentElement);
    return () => observer.disconnect();
  }, [handle]);

  return (
    <main className="bru-embed-main" data-embed="true">
      <HostProfile
        handle={handle}
        initialUser={initialUser}
        initialSlots={initialSlots}
        renderedAt={renderedAt}
      />
    </main>
  );
}
