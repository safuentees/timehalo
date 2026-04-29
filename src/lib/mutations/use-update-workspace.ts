"use client";

import { toast } from "sonner";
import { trpc, type ReactQueryOptions } from "@/trpc/hooks";

// `workspaces.update` — rename + slug change. workspace.write scope
// (OWNER + ADMIN). CONFLICT on duplicate slug surfaces inline via
// react-hook-form's setError; suppress the generic toast for that one
// code so the form-level message is the only feedback the user sees.

type Options = ReactQueryOptions["workspaces"]["update"];

export function useUpdateWorkspace(options?: Options) {
  return trpc.workspaces.update.useMutation({
    ...options,
    onSuccess: async (...args) => {
      toast.success("Workspace updated.");
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
