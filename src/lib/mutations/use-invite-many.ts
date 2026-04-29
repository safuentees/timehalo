"use client";

import { toast } from "sonner";
import { trpc, type ReactQueryOptions } from "@/trpc/hooks";

type Options = ReactQueryOptions["workspaces"]["inviteMany"];

export function useInviteMany(options?: Options) {
  return trpc.workspaces.inviteMany.useMutation({
    ...options,
    onSuccess: async (...args) => {
      const [data] = args;
      const count = data.length;
      toast.success(
        count === 1
          ? "Invitation sent."
          : `${count} invitations sent.`,
      );
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
