"use client";

import { toast } from "sonner";
import { trpc, type ReactQueryOptions } from "@/trpc/hooks";

type Options = ReactQueryOptions["workspaces"]["delete"];

export function useDeleteWorkspace(options?: Options) {
  return trpc.workspaces.delete.useMutation({
    ...options,
    onSuccess: async (...args) => {
      toast.success("Workspace deleted.");
      await options?.onSuccess?.(...args);
    },
    onError: (...args) => {
      const [error] = args;
      if (error.data?.code !== "PRECONDITION_FAILED") {
        toast.error(error.message);
      }
      options?.onError?.(...args);
    },
  });
}
