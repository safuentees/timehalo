"use client";

import { toast } from "sonner";
import { trpc, type ReactQueryOptions } from "@/trpc/hooks";

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
      if (error.data?.code !== "CONFLICT") {
        toast.error(error.message);
      }
      options?.onError?.(...args);
    },
  });
}
