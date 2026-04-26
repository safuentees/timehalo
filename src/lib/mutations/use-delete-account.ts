"use client";

import { toast } from "sonner";
import { trpc, type ReactQueryOptions } from "@/trpc/hooks";

// Custom mutation hook for `users.deleteAccount`. Toasts on failure;
// success is intentionally caller-owned (the caller must signOut()
// + redirect after the mutation resolves, otherwise the next render
// hits the now-deleted session and 500s).

type Options = ReactQueryOptions["users"]["deleteAccount"];

export function useDeleteAccount(options?: Options) {
  return trpc.users.deleteAccount.useMutation({
    ...options,
    onError: (...args) => {
      const [error] = args;
      toast.error(error.message);
      options?.onError?.(...args);
    },
  });
}
