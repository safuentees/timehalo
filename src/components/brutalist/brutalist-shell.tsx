"use client";

import { Suspense, useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { trpc } from "@/trpc/hooks";
import { BrutalistSidebar } from "./sidebar";
import { BrutalistMain } from "./main";
import { NewPostModal } from "./new-post-modal";
import { TweaksPanel } from "./tweaks-panel";
import {
  HALFTONE_DEFAULTS,
  type HalftoneTweaks,
} from "@/lib/halftone-defaults";

type Typeface = "grotesk" | "serif" | "mono";
type Density = "airy" | "dense";

const STORAGE_KEY = "bru:tweaks";

export function BrutalistShell() {
  const [mounted, setMounted] = useState(false);
  const [typeface, setTypeface] = useState<Typeface>("grotesk");
  const [density, setDensity] = useState<Density>("airy");
  const [motion, setMotion] = useState(true);
  const [newOpen, setNewOpen] = useState(false);
  const [tweaks, setTweaks] = useState<HalftoneTweaks>(HALFTONE_DEFAULTS);

  const { resolvedTheme, setTheme } = useTheme();

  const postsQ = trpc.posts.list.useQuery();
  const delPost = trpc.posts.del.useMutation();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  useEffect(() => {
    const id = requestAnimationFrame(() =>
      document.body.classList.add("bru-ready"),
    );
    return () => {
      cancelAnimationFrame(id);
      document.body.classList.remove("bru-ready");
    };
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<HalftoneTweaks>;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTweaks((prev) => ({ ...prev, ...parsed }));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tweaks));
    } catch {
      // ignore
    }
  }, [tweaks]);

  const rootClass = ["bru-root", motion ? "bru-motion" : ""]
    .filter(Boolean)
    .join(" ");

  const theme = mounted ? resolvedTheme : undefined;

  return (
    <div className={rootClass} data-typeface={typeface} data-density={density}>
      <BrutalistSidebar />
      <BrutalistMain
        posts={postsQ.data}
        onNewPost={() => setNewOpen(true)}
        onDelete={(id) => delPost.mutate({ id })}
        tweaks={tweaks}
        motion={motion}
        theme={theme}
        onThemeToggle={() =>
          setTheme(resolvedTheme === "dark" ? "light" : "dark")
        }
      />
      <NewPostModal open={newOpen} onClose={() => setNewOpen(false)} />
      <Suspense fallback={null}>
        <TweaksPanel
          theme={theme}
          setTheme={setTheme}
          typeface={typeface}
          setTypeface={setTypeface}
          density={density}
          setDensity={setDensity}
          motion={motion}
          setMotion={setMotion}
          tweaks={tweaks}
          onTweaksChange={(patch) =>
            setTweaks((prev) => ({ ...prev, ...patch }))
          }
        />
      </Suspense>
    </div>
  );
}
