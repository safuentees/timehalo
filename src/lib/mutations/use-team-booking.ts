"use client";

import { toast } from "sonner";
import { trpc, type ReactQueryOptions } from "@/trpc/hooks";

type Options = ReactQueryOptions["workspaces"]["bookForTeam"];

export function useTeamBooking(options?: Options) {
  return trpc.workspaces.bookForTeam.useMutation({
    ...options,
    onSuccess: async (...args) => {
      await options?.onSuccess?.(...args);
    },
    onError: (...args) => {
      const [error] = args;
      toast.error(error.message);
      options?.onError?.(...args);
    },
  });
}
