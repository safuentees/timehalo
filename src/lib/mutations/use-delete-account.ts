"use client";

import { toast } from "sonner";
import { trpc, type ReactQueryOptions } from "@/trpc/hooks";

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
