"use client";

import { toast } from "sonner";
import { trpc, type ReactQueryOptions } from "@/trpc/hooks";

// `workspaces.updateInvitationRole` — patch the role on a pending
// invitation. Same role rules as invite (OWNER can't be granted,
// ADMIN needs OWNER caller). FORBIDDEN surfaces inline through the
// caller — the row already shows the new role's pill before the
// mutation, so we want the user to see WHY it bounced.

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
