"use client";

import { toast } from "sonner";
import type { inferRouterOutputs } from "@trpc/server";
import { trpc, type ReactQueryOptions } from "@/trpc/hooks";
import type { AppRouter } from "@/trpc/router";

// Custom mutation hook for `workflows.update` (B.PT96 — optimistic).
//
// Pattern: Tanstack Query canonical optimistic-mutation shape
// (https://tanstack.com/query/v5/docs/framework/react/guides/optimistic-updates).
//   1. `onMutate`: cancel in-flight `workflows.list` refetches so a
//      late server response doesn't overwrite our patch, snapshot
//      the current cache for rollback, then patch the matching
//      workflow row with the optimistic field set.
//   2. `onError`: roll back to the snapshot, surface toast.
//   3. `onSuccess`: success toast + delegate to caller.
//   4. `onSettled` is NOT needed here — `src/trpc/hooks.ts` ships a
//      global `invalidateQueries()` override on every mutation
//      success, which reconciles the cache against the server.
//
// Reference impl for B.PT96's optimistic-UI rollout (per
// `docs/optimistic-ui-audit.md`). The toggle on `workflow.active`
// is the most-frequent mutation in /settings → workflows; user
// sees the Switch flip instantly instead of a server roundtrip.

type Options = ReactQueryOptions["workflows"]["update"];
type WorkflowsList = inferRouterOutputs<AppRouter>["workflows"]["list"];

export function useUpdateWorkflow(options?: Options) {
  const utils = trpc.useUtils();
  return trpc.workflows.update.useMutation({
    ...options,
    onMutate: async (variables) => {
      // Cancel any in-flight `workflows.list` refetches so a late
      // server response doesn't overwrite our patched cache.
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
      // Per `.claude/rules/mutation-hooks.md`: hooks override
      // onSuccess + onError + forward to caller, but don't expose
      // an onMutate forwarding contract. None of the 34 sibling
      // hooks accept caller-supplied onMutate, so this hook
      // doesn't either — keeps the optimism context shape
      // private.
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
