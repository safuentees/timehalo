"use client";

import { toast } from "sonner";
import { trpc, type ReactQueryOptions } from "@/trpc/hooks";

type Options = ReactQueryOptions["workspaces"]["leave"];

export function useLeaveWorkspace(options?: Options) {
  return trpc.workspaces.leave.useMutation({
    ...options,
    onSuccess: async (...args) => {
      toast.success("Left workspace.");
      await options?.onSuccess?.(...args);
    },
    onError: (...args) => {
      const [error] = args;
      if (error.data?.code !== "FORBIDDEN") {
        toast.error(error.message);
      }
      options?.onError?.(...args);
    },
  });
}
