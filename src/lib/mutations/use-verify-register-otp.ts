"use client";

import { toast } from "sonner";
import { trpc, type ReactQueryOptions } from "@/trpc/hooks";

type Options = ReactQueryOptions["auth"]["verifyRegisterOtp"];

// Mutation wrapper for `auth.verifyRegisterOtp` (step 2 of OTP
// register). Inline-error codes the caller will handle as field
// errors rather than toasts:
//   - BAD_REQUEST → wrong code or expired (caller setError on `code`)
//   - TOO_MANY_REQUESTS → lockout (caller renders a banner)
// Anything else (network failures, INTERNAL_SERVER_ERROR) toasts so
// the user sees something; without this the form would feel dead.
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
