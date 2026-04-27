"use client";

import { toast } from "sonner";
import { trpc, type ReactQueryOptions } from "@/trpc/hooks";

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
