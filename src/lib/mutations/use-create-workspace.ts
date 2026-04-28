"use client";

import { toast } from "sonner";
import { trpc, type ReactQueryOptions } from "@/trpc/hooks";

type Options = ReactQueryOptions["workspaces"]["create"];

export function useCreateWorkspace(options?: Options) {
  return trpc.workspaces.create.useMutation({
    ...options,
    onSuccess: async (...args) => {
      toast.success("Workspace created.");
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
