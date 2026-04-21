"use client";

import { toast } from "sonner";
import { trpc, type ReactQueryOptions } from "@/trpc/hooks";

type Options = ReactQueryOptions["schedule"]["save"];

export function useScheduleSave(options?: Options) {
  return trpc.schedule.save.useMutation({
    ...options,
    onSuccess: async (...args) => {
      const [data] = args;
      toast.success(
        data.count === 0
          ? "Schedule cleared."
          : `Saved ${data.count} window${data.count === 1 ? "" : "s"}.`,
      );
      await options?.onSuccess?.(...args);
    },
    onError: (...args) => {
      const [error] = args;
      toast.error(error.message);
      options?.onError?.(...args);
    },
  });
}
