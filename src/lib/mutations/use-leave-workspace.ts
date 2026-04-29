"use client";

import { toast } from "sonner";
import { trpc, type ReactQueryOptions } from "@/trpc/hooks";

// `workspaces.leave` — operates on the caller's own membership. OWNER
// is blocked server-side (must transfer ownership or delete first);
// the FORBIDDEN response surfaces inline via the caller so the user
// learns why and how to proceed instead of just seeing a toast.

type Options = ReactQueryOptions["workspaces"]["leave"];

export function useLeaveWorkspace(options?: Options) {
  return trpc.workspaces.leave.useMutation({
    ...options,
    onSuccess: async (...args) => {
      toast.success("Left workspace.");
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
