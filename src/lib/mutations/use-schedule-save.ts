"use client";

import { toast } from "sonner";
import { trpc, type ReactQueryOptions } from "@/trpc/hooks";

/**
 * Custom mutation hook for `schedule.save`. Wraps the raw tRPC mutation
 * with default side effects (success/error toast) and lets callers pass
 * extra options that run AFTER the defaults — no collision.
 *
 * This is the canonical tRPC pattern from the official docs:
 *   https://trpc.io/docs/client/react/infer-types#creating-a-custom-hook
 *
 * Global query invalidation is already wired in `src/trpc/hooks.ts`
 * via `overrides.useMutation.onSuccess`, so we don't call `utils.x.invalidate`
 * here — every successful mutation already triggers invalidateQueries.
 */

type Options = ReactQueryOptions["schedule"]["save"];

export function useScheduleSave(options?: Options) {
  return trpc.schedule.save.useMutation({
    ...options,
    onSuccess: async (...args) => {
      const [data] = args;
      toast.success(
        data.count === 0
          ? "Schedule cleared."
          : `Saved ${data.count} window${data.count === 1 ? "" : "s"}.`,
      );
      await options?.onSuccess?.(...args);
    },
    onError: (...args) => {
      const [error] = args;
      toast.error(error.message);
      options?.onError?.(...args);
    },
  });
}
