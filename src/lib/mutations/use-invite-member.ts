"use client";

import { toast } from "sonner";
import { trpc, type ReactQueryOptions } from "@/trpc/hooks";

// `workspaces.invite` — sends a workspace-invite email via the Task
// queue. FORBIDDEN (e.g. non-owner trying to grant ADMIN) is shown
// inline by the invite dialog; suppress the generic toast for that
// case so the inline error is the only signal.

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
