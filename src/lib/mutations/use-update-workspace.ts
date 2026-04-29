"use client";

import { toast } from "sonner";
import { trpc, type ReactQueryOptions } from "@/trpc/hooks";

type Options = ReactQueryOptions["workspaces"]["update"];

export function useUpdateWorkspace(options?: Options) {
  return trpc.workspaces.update.useMutation({
    ...options,
    onSuccess: async (...args) => {
      toast.success("Workspace updated.");
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
