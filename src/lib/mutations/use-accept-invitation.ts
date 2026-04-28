"use client";

import { toast } from "sonner";
import { trpc, type ReactQueryOptions } from "@/trpc/hooks";

type Options = ReactQueryOptions["invitations"]["accept"];

export function useAcceptInvitation(options?: Options) {
  return trpc.invitations.accept.useMutation({
    ...options,
    onSuccess: async (...args) => {
      toast.success("Joined the workspace.");
      await options?.onSuccess?.(...args);
    },
    onError: (...args) => {
      const [error] = args;
      toast.error(error.message);
      options?.onError?.(...args);
    },
  });
}
