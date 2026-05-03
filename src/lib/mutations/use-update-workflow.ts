"use client";

import { toast } from "sonner";
import type { inferRouterOutputs } from "@trpc/server";
import { trpc, type ReactQueryOptions } from "@/trpc/hooks";
import type { AppRouter } from "@/trpc/router";

type Options = ReactQueryOptions["workflows"]["update"];
type WorkflowsList = inferRouterOutputs<AppRouter>["workflows"]["list"];

export function useUpdateWorkflow(options?: Options) {
  const utils = trpc.useUtils();
  return trpc.workflows.update.useMutation({
    ...options,
    onMutate: async (variables) => {
      await utils.workflows.list.cancel();
      const previous = utils.workflows.list.getData();
      utils.workflows.list.setData(undefined, (old) => {
        if (!old) return old;
        return old.map((row) =>
          row.id === variables.id
            ? {
                ...row,
                ...(variables.name !== undefined ? { name: variables.name } : {}),
                ...(variables.active !== undefined
                  ? { active: variables.active }
                  : {}),
              }
            : row,
        );
      });
      return { previous };
    },
    onError: (...args) => {
      const [error, , context] = args;
      const ctx = context as
        | { previous: WorkflowsList | undefined }
        | undefined;
      if (ctx?.previous !== undefined) {
        utils.workflows.list.setData(undefined, ctx.previous);
      }
      toast.error(error.message);
      options?.onError?.(...args);
    },
    onSuccess: async (...args) => {
      toast.success("Workflow updated.");
      await options?.onSuccess?.(...args);
    },
  });
}
