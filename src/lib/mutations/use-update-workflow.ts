"use client";

import { toast } from "sonner";
import { trpc, type ReactQueryOptions } from "@/trpc/hooks";

// Custom mutation hook for `workflows.update`. Global tRPC
// invalidation in src/trpc/hooks.ts refreshes workflows.list.

type Options = ReactQueryOptions["workflows"]["update"];

export function useUpdateWorkflow(options?: Options) {
  return trpc.workflows.update.useMutation({
    ...options,
    onSuccess: async (...args) => {
      toast.success("Workflow updated.");
      await options?.onSuccess?.(...args);
    },
    onError: (...args) => {
      const [error] = args;
      toast.error(error.message);
      options?.onError?.(...args);
    },
  });
}
