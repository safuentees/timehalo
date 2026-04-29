"use client";

import { toast } from "sonner";
import { trpc, type ReactQueryOptions } from "@/trpc/hooks";

type Options = ReactQueryOptions["workspaces"]["updateInvitationRole"];

export function useUpdateInvitationRole(options?: Options) {
  return trpc.workspaces.updateInvitationRole.useMutation({
    ...options,
    onSuccess: async (...args) => {
      toast.success("Invitation role updated.");
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
