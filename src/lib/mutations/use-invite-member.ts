"use client";

import { toast } from "sonner";
import { trpc, type ReactQueryOptions } from "@/trpc/hooks";

type Options = ReactQueryOptions["workspaces"]["invite"];

export function useInviteMember(options?: Options) {
  return trpc.workspaces.invite.useMutation({
    ...options,
    onSuccess: async (...args) => {
      toast.success("Invitation sent.");
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
