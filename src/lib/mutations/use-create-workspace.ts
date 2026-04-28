"use client";

import { toast } from "sonner";
import { trpc, type ReactQueryOptions } from "@/trpc/hooks";

// Custom mutation hook for `workspaces.create`. Global tRPC
// invalidation in src/trpc/hooks.ts refreshes workspaces.list.
//
// CONFLICT (slug taken) is surfaced inline by the create dialog via
// form.setError; suppress the generic toast for that case so the
// inline error is the only signal.

type Options = ReactQueryOptions["workspaces"]["create"];

export function useCreateWorkspace(options?: Options) {
  return trpc.workspaces.create.useMutation({
    ...options,
    onSuccess: async (...args) => {
      toast.success("Workspace created.");
      await options?.onSuccess?.(...args);
    },
    onError: (...args) => {
      const [error] = args;
      if (error.data?.code !== "CONFLICT") {
        toast.error(error.message);
      }
      options?.onError?.(...args);
    },
  });
}
