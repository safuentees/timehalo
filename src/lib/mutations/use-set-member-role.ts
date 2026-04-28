"use client";

import { toast } from "sonner";
import { trpc, type ReactQueryOptions } from "@/trpc/hooks";

type Options = ReactQueryOptions["workspaces"]["setMemberRole"];

export function useSetMemberRole(options?: Options) {
  return trpc.workspaces.setMemberRole.useMutation({
    ...options,
    onSuccess: async (...args) => {
      toast.success("Role updated.");
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
