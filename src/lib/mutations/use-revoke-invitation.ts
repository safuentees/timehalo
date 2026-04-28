"use client";

import { toast } from "sonner";
import { trpc, type ReactQueryOptions } from "@/trpc/hooks";

type Options = ReactQueryOptions["workspaces"]["revokeInvitation"];

export function useRevokeInvitation(options?: Options) {
  return trpc.workspaces.revokeInvitation.useMutation({
    ...options,
    onSuccess: async (...args) => {
      toast.success("Invitation revoked.");
      await options?.onSuccess?.(...args);
    },
    onError: (...args) => {
      const [error] = args;
      toast.error(error.message);
      options?.onError?.(...args);
    },
  });
}
