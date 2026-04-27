"use client";

import { toast } from "sonner";
import { trpc, type ReactQueryOptions } from "@/trpc/hooks";

type Options = ReactQueryOptions["workspaces"]["apiKeys"]["revoke"];

export function useRevokeApiKey(options?: Options) {
  return trpc.workspaces.apiKeys.revoke.useMutation({
    ...options,
    onSuccess: async (...args) => {
      toast.success("API key revoked.");
      await options?.onSuccess?.(...args);
    },
    onError: (...args) => {
      const [error] = args;
      toast.error(error.message);
      options?.onError?.(...args);
    },
  });
}
