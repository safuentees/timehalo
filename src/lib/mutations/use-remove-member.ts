"use client";

import { toast } from "sonner";
import { trpc, type ReactQueryOptions } from "@/trpc/hooks";

// `workspaces.removeMember` — admin/owner action. Confirmation lives
// in the calling UI (window.confirm or a typed-handle dialog).

type Options = ReactQueryOptions["workspaces"]["removeMember"];

export function useRemoveMember(options?: Options) {
  return trpc.workspaces.removeMember.useMutation({
    ...options,
    onSuccess: async (...args) => {
      toast.success("Member removed.");
      await options?.onSuccess?.(...args);
    },
    onError: (...args) => {
      const [error] = args;
      toast.error(error.message);
      options?.onError?.(...args);
    },
  });
}
