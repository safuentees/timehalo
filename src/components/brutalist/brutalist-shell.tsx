"use client";

import { Suspense, useEffect, useState } from "react";
import { trpc } from "@/trpc/hooks";
import { BrutalistSidebar } from "./sidebar";
import { BrutalistMain } from "./main";
import { NewPostModal } from "./new-post-modal";
import { TweaksPanel } from "./tweaks-panel";
import { useBrutalistPrefs } from "./prefs-context";

export function BrutalistShell() {
  const [newOpen, setNewOpen] = useState(false);
  const { typeface, density, motion } = useBrutalistPrefs();

  const postsQ = trpc.posts.list.useQuery();
  const delPost = trpc.posts.del.useMutation();

  useEffect(() => {
    const id = requestAnimationFrame(() =>
      document.body.classList.add("bru-ready"),
    );
    return () => {
      cancelAnimationFrame(id);
      document.body.classList.remove("bru-ready");
    };
  }, []);

  const rootClass = ["bru-root", motion ? "bru-motion" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={rootClass} data-typeface={typeface} data-density={density}>
      <BrutalistSidebar />
      <BrutalistMain
        posts={postsQ.data}
        onNewPost={() => setNewOpen(true)}
        onDelete={(id) => delPost.mutate({ id })}
      />
      <NewPostModal open={newOpen} onClose={() => setNewOpen(false)} />
      <Suspense fallback={null}>
        <TweaksPanel />
      </Suspense>
    </div>
  );
}
