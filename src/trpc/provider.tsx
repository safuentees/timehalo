"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  httpBatchLink,
  httpSubscriptionLink,
  splitLink,
} from "@trpc/client";
import { useState } from "react";
import { trpc } from "@/trpc/hooks";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Stale after 60s — matches Rallly. Long enough to skip
        // refetch on intra-page interactions, short enough that
        // mutations elsewhere don't go unnoticed for too long.
        staleTime: 60 * 1000,
        // Garbage-collect after 10 minutes (default is 5). Settings
        // is revisit-heavy: open settings → check something → go back
        // → return. The default GC dumps the cache too aggressively
        // for that pattern, forcing a "Loading…" flash on every
        // re-entry post-5-min idle. 10min covers normal nav rhythm
        // without holding stale data forever.
        gcTime: 10 * 60 * 1000,
        // Tab-back refetch defaults to TRUE in TanStack Query — every
        // time the user alt-tabs into the dashboard, every mounted
        // query refires. Dashboard data is invalidated explicitly on
        // mutations (custom mutation hooks + `utils.invalidate()`) and
        // on workspace switch; we don't need the focus heuristic on
        // top of that. The /h/[handle] visitor surface set this
        // per-query and the snappy feel is the result. Promote to a
        // global default so every dashboard surface inherits the same
        // behavior without each callsite re-declaring it.
        refetchOnWindowFocus: false,
        // Same logic for reconnect — explicit invalidation is the
        // contract; no implicit refetch on transient network blips.
        refetchOnReconnect: false,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

function getQueryClient() {
  if (typeof window === "undefined") {
    return makeQueryClient();
  }
  if (!browserQueryClient) browserQueryClient = makeQueryClient();
  return browserQueryClient;
}

export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();
  const [trpcClient] = useState(() =>
    trpc.createClient({
      // splitLink routes subscription operations to httpSubscriptionLink
      // (SSE) and everything else to httpBatchLink (HTTP). Pattern is
      // straight from tRPC v11 docs (Context7-verified). Without this,
      // subscription procedures would 404 — the batch link doesn't
      // know how to talk SSE.
      links: [
        splitLink({
          condition: (op) => op.type === "subscription",
          true: httpSubscriptionLink({ url: "/api/trpc" }),
          false: httpBatchLink({ url: "/api/trpc" }),
        }),
      ],
    }),
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </trpc.Provider>
  );
}
