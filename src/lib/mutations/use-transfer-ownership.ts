"use client";

import { toast } from "sonner";
import { trpc, type ReactQueryOptions } from "@/trpc/hooks";

type Options = ReactQueryOptions["workspaces"]["transferOwnership"];

export function useTransferOwnership(options?: Options) {
  return trpc.workspaces.transferOwnership.useMutation({
    ...options,
    onSuccess: async (...args) => {
      toast.success("Ownership transferred.");
      await options?.onSuccess?.(...args);
    },
    onError: (...args) => {
      const [error] = args;
      toast.error(error.message);
      options?.onError?.(...args);
    },
  });
}
