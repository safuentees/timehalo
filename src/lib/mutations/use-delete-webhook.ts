"use client";

import { toast } from "sonner";
import { trpc, type ReactQueryOptions } from "@/trpc/hooks";

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
