"use client";

import { toast } from "sonner";
import { trpc, type ReactQueryOptions } from "@/trpc/hooks";

type Options = ReactQueryOptions["users"]["setBio"];

export function useSetBio(options?: Options) {
  return trpc.users.setBio.useMutation({
    ...options,
    onSuccess: async (...args) => {
      const [data] = args;
      toast.success(data.bio ? "Bio saved." : "Bio cleared.");
      await options?.onSuccess?.(...args);
    },
    onError: (...args) => {
      const [error] = args;
      toast.error(error.message);
      options?.onError?.(...args);
    },
  });
}
