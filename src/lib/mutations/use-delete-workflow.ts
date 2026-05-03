"use client";

import { toast } from "sonner";
import type { inferRouterOutputs } from "@trpc/server";
import { trpc, type ReactQueryOptions } from "@/trpc/hooks";
import type { AppRouter } from "@/trpc/router";

// Custom mutation hook for `workflows.delete` (B.PT96 — optimistic).
//
// Pattern: same canonical Tanstack shape as `use-update-workflow`
// but the patch removes the row instead of editing fields. See
// `docs/optimistic-ui-audit.md` for the full pattern + the
// recommended toast-undo extension that should layer on this in a
// future commit (B.PT98 wave 3 — destructive list operations).
//
// `onSettled` is NOT needed — global `invalidateQueries()` override
// in `src/trpc/hooks.ts` reconciles against the server post-success.

type Options = ReactQueryOptions["workflows"]["delete"];
type WorkflowsList = inferRouterOutputs<AppRouter>["workflows"]["list"];

export function useDeleteWorkflow(options?: Options) {
  const utils = trpc.useUtils();
  return trpc.workflows.delete.useMutation({
    ...options,
    onMutate: async (variables) => {
      await utils.workflows.list.cancel();
      const previous = utils.workflows.list.getData();
      utils.workflows.list.setData(undefined, (old) => {
        if (!old) return old;
        return old.filter((row) => row.id !== variables.id);
      });
      // Per `.claude/rules/mutation-hooks.md`: hooks don't forward
      // caller onMutate (no sibling hook does). Keeps the optimism
      // context shape private to this file.
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
      toast.success("Workflow deleted.");
      await options?.onSuccess?.(...args);
    },
  });
}
