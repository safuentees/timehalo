"use client";

import { toast } from "sonner";
import { trpc, type ReactQueryOptions } from "@/trpc/hooks";

/**
 * Custom mutation hook for `users.setHandle`. Shows a success toast on
 * success; the caller is expected to handle CONFLICT via its own `onError`
 * (typically to attach a field-level error via `form.setError`).
 *
 * Generic errors (non-CONFLICT) surface as a toast so the user sees
 * something without the caller having to wire every mutation.
 */

type Options = ReactQueryOptions["users"]["setHandle"];

export function useSetHandle(options?: Options) {
  return trpc.users.setHandle.useMutation({
    ...options,
    onSuccess: async (...args) => {
      toast.success(`Handle updated to /h/${args[0].handle}.`);
      await options?.onSuccess?.(...args);
    },
    onError: (...args) => {
      const [error] = args;
      // Let the caller render CONFLICT as a field error — don't toast.
      if (error.data?.code !== "CONFLICT") {
        toast.error(error.message);
      }
      options?.onError?.(...args);
    },
  });
}
