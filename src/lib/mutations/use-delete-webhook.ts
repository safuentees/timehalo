"use client";

import { toast } from "sonner";
import { trpc, type ReactQueryOptions } from "@/trpc/hooks";

// Custom mutation hook for `webhooks.delete`. Toasts on success +
// failure; global invalidation in src/trpc/hooks.ts refreshes
// `webhooks.list` automatically so the row disappears without manual
// cache surgery.

type Options = ReactQueryOptions["webhooks"]["delete"];

export function useDeleteWebhook(options?: Options) {
  return trpc.webhooks.delete.useMutation({
    ...options,
    onSuccess: async (...args) => {
      toast.success("Webhook deleted.");
      await options?.onSuccess?.(...args);
    },
    onError: (...args) => {
      const [error] = args;
      toast.error(error.message);
      options?.onError?.(...args);
    },
  });
}
