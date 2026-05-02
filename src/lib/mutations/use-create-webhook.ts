"use client";

import { toast } from "sonner";
import { trpc, type ReactQueryOptions } from "@/trpc/hooks";

// Custom mutation hook for `webhooks.create`. Toasts on failure;
// success is caller-owned because the response carries the freshly-
// minted `secret` (returned EXACTLY ONCE — the .list response only
// surfaces metadata, not the secret). The dialog swaps to a "reveal"
// view to display it, so a generic success toast would be redundant.

type Options = ReactQueryOptions["webhooks"]["create"];

export function useCreateWebhook(options?: Options) {
  return trpc.webhooks.create.useMutation({
    ...options,
    onError: (...args) => {
      const [error] = args;
      toast.error(error.message);
      options?.onError?.(...args);
    },
  });
}
