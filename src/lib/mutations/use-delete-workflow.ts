"use client";

import { toast } from "sonner";
import { trpc, type ReactQueryOptions } from "@/trpc/hooks";

// Custom mutation hook for `workflows.delete`. Global tRPC
// invalidation in src/trpc/hooks.ts refreshes workflows.list.

type Options = ReactQueryOptions["workflows"]["delete"];

export function useDeleteWorkflow(options?: Options) {
  return trpc.workflows.delete.useMutation({
    ...options,
    onSuccess: async (...args) => {
      toast.success("Workflow deleted.");
      await options?.onSuccess?.(...args);
    },
    onError: (...args) => {
      const [error] = args;
      toast.error(error.message);
      options?.onError?.(...args);
    },
  });
}
