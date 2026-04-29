"use client";

import { toast } from "sonner";
import { trpc, type ReactQueryOptions } from "@/trpc/hooks";

// `workspaces.delete` — OWNER-only, cascades to bookings / audit /
// api-keys / webhooks / event-types / subscription / memberships.
// PRECONDITION_FAILED fires when this would leave the user with zero
// owned workspaces; that error is surfaced inline by the dialog
// instead of a transient toast so the user can take the actionable
// next step (transfer ownership or create another workspace first).

type Options = ReactQueryOptions["workspaces"]["delete"];

export function useDeleteWorkspace(options?: Options) {
  return trpc.workspaces.delete.useMutation({
    ...options,
    onSuccess: async (...args) => {
      toast.success("Workspace deleted.");
      await options?.onSuccess?.(...args);
    },
    onError: (...args) => {
      const [error] = args;
      if (error.data?.code !== "PRECONDITION_FAILED") {
        toast.error(error.message);
      }
      options?.onError?.(...args);
    },
  });
}
