"use client";

import { toast } from "sonner";
import { trpc, type ReactQueryOptions } from "@/trpc/hooks";

type Options = ReactQueryOptions["workspaces"]["resendInvitation"];

export function useResendInvitation(options?: Options) {
  return trpc.workspaces.resendInvitation.useMutation({
    ...options,
    onSuccess: async (...args) => {
      toast.success("Invitation resent.");
      await options?.onSuccess?.(...args);
    },
    onError: (...args) => {
      const [error] = args;
      toast.error(error.message);
      options?.onError?.(...args);
    },
  });
}
