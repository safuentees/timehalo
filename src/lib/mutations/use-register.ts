"use client";

import { toast } from "sonner";
import { trpc, type ReactQueryOptions } from "@/trpc/hooks";

type Options = ReactQueryOptions["auth"]["register"];

export function useRegister(options?: Options) {
  return trpc.auth.register.useMutation({
    ...options,
    onSuccess: async (...args) => {
      toast.success("Account created.");
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
