"use client";

import { toast } from "sonner";
import { trpc, type ReactQueryOptions } from "@/trpc/hooks";

// `workspaces.transferOwnership` — atomic OWNER↔ADMIN swap inside
// one transaction. The current owner demotes to ADMIN, the target
// promotes to OWNER, and Workspace.ownerId moves with them. After
// success, every workspace-scoped query in the cache stales; the
// global invalidation hook in src/trpc/hooks.ts handles the refetch.

type Options = ReactQueryOptions["workspaces"]["transferOwnership"];

export function useTransferOwnership(options?: Options) {
  return trpc.workspaces.transferOwnership.useMutation({
    ...options,
    onSuccess: async (...args) => {
      toast.success("Ownership transferred.");
      await options?.onSuccess?.(...args);
    },
    onError: (...args) => {
      const [error] = args;
      toast.error(error.message);
      options?.onError?.(...args);
    },
  });
}
