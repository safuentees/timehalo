"use client";

import { toast } from "sonner";
import { trpc, type ReactQueryOptions } from "@/trpc/hooks";

// `workspaces.resendInvitation` — rotates the token + refreshes the
// expiry, then enqueues a fresh workspace-invite email Task. The
// previous accept link stops working as soon as the procedure
// commits, so the toast copy emphasizes "sent" rather than
// "queued" — the user just clicked Resend and expects the link
// they gave the recipient to be the new one.

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
