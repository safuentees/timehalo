"use client";

import { toast } from "sonner";
import { trpc, type ReactQueryOptions } from "@/trpc/hooks";

type Options = ReactQueryOptions["workspaces"]["apiKeys"]["create"];

export function useCreateApiKey(options?: Options) {
  return trpc.workspaces.apiKeys.create.useMutation({
    ...options,
    onError: (...args) => {
      const [error] = args;
      toast.error(error.message);
      options?.onError?.(...args);
    },
  });
}
