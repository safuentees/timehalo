"use client";

import { toast } from "sonner";
import { trpc, type ReactQueryOptions } from "@/trpc/hooks";

// `workspaces.inviteMany` — bulk-invite procedure (B.PT9). Server
// validates role rules across the whole batch + checks plan cap on
// the batch count, all-or-nothing. The hook reports the count to
// the toast so the user knows exactly how many invites went out.
// FORBIDDEN (cap exceeded / role rule) surfaces inline through the
// caller — the whole batch UI shows an error rather than the
// per-row that single-invite uses.

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
