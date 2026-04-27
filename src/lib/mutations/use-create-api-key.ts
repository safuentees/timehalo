"use client";

import { toast } from "sonner";
import { trpc, type ReactQueryOptions } from "@/trpc/hooks";

// Custom mutation hook for `workspaces.apiKeys.create`. Toasts on
// failure; success is intentionally caller-owned because the response
// carries the freshly-minted token (returned EXACTLY ONCE) — the
// caller swaps the dialog body to a "your token" view to display it,
// so a generic success toast would be redundant.

type Options = ReactQueryOptions["workspaces"]["apiKeys"]["create"];

export function useCreateApiKey(options?: Options) {
  return trpc.workspaces.apiKeys.create.useMutation({
    ...options,
    onError: (...args) => {
      const [error] = args;
      toast.error(error.message);
      options?.onError?.(...args);
    },
  });
}
