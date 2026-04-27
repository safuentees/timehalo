"use client";

import { toast } from "sonner";
import { trpc, type ReactQueryOptions } from "@/trpc/hooks";

type Options = ReactQueryOptions["workflows"]["create"];

export function useCreateWorkflow(options?: Options) {
  return trpc.workflows.create.useMutation({
    ...options,
    onSuccess: async (...args) => {
      toast.success("Workflow created.");
      await options?.onSuccess?.(...args);
    },
    onError: (...args) => {
      const [error] = args;
      toast.error(error.message);
      options?.onError?.(...args);
    },
  });
}
