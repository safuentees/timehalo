"use client";

import { toast } from "sonner";
import { trpc, type ReactQueryOptions } from "@/trpc/hooks";

// `invitations.accept` — moves the invited user into the workspace
// as the role baked into the invitation row. The accept page handles
// the post-accept redirect via the caller's onSuccess.

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
