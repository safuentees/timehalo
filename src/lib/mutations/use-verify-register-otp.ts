"use client";

import { toast } from "sonner";
import { trpc, type ReactQueryOptions } from "@/trpc/hooks";

type Options = ReactQueryOptions["auth"]["verifyRegisterOtp"];

export function useVerifyRegisterOtp(options?: Options) {
  return trpc.auth.verifyRegisterOtp.useMutation({
    ...options,
    onError: (...args) => {
      const [error] = args;
      const code = error.data?.code;
      const inlineCodes: ReadonlyArray<typeof code> = [
        "BAD_REQUEST",
        "TOO_MANY_REQUESTS",
        "CONFLICT",
      ];
      if (!inlineCodes.includes(code)) {
        toast.error(error.message);
      }
      options?.onError?.(...args);
    },
  });
}
