"use client";

import { toast } from "sonner";
import { trpc, type ReactQueryOptions } from "@/trpc/hooks";

/**
 * Custom mutation hook for `users.setBio`. Shows a success toast
 * (different copy for "saved" vs "cleared" so the user knows their
 * empty submit was honored as an explicit clear).
 *
 * No special error path — the only validation is the length cap
 * (500 chars), which the form catches before submission via zod's
 * client-side resolver. Any backend error surfaces as a generic
 * toast.
 */

type Options = ReactQueryOptions["users"]["setBio"];

export function useSetBio(options?: Options) {
  return trpc.users.setBio.useMutation({
    ...options,
    onSuccess: async (...args) => {
      const [data] = args;
      toast.success(data.bio ? "Bio saved." : "Bio cleared.");
      await options?.onSuccess?.(...args);
    },
    onError: (...args) => {
      const [error] = args;
      toast.error(error.message);
      options?.onError?.(...args);
    },
  });
}
