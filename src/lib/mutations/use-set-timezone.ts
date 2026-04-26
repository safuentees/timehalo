"use client";

import { toast } from "sonner";
import { trpc, type ReactQueryOptions } from "@/trpc/hooks";

// Custom mutation hook for `users.setTimezone`. Toasts on failure;
// callers handle success (router push, form reset, etc.). Global
// invalidation in src/trpc/hooks.ts refreshes users.me + getByHandle.

type Options = ReactQueryOptions["users"]["setTimezone"];

export function useSetTimezone(options?: Options) {
  return trpc.users.setTimezone.useMutation({
    ...options,
    onSuccess: async (...args) => {
      toast.success("Timezone updated.");
      await options?.onSuccess?.(...args);
    },
    onError: (...args) => {
      const [error] = args;
      toast.error(error.message);
      options?.onError?.(...args);
    },
  });
}
