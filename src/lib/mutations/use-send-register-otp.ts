"use client";

import { toast } from "sonner";
import { trpc, type ReactQueryOptions } from "@/trpc/hooks";

type Options = ReactQueryOptions["auth"]["sendRegisterOtp"];

// Mutation wrapper for `auth.sendRegisterOtp` (step 1 of OTP register).
// CONFLICT (email already registered) bubbles up to the form so the
// caller can inline a "use a different email" link to /login; every
// other error becomes a toast. Pattern lifted from `useRegister` so
// the OTP path stays consistent with the legacy register flow.
export function useSendRegisterOtp(options?: Options) {
  return trpc.auth.sendRegisterOtp.useMutation({
    ...options,
    onSuccess: async (...args) => {
      // Success toast lives in the form so it can quote the email
      // address back to the user — the hook can't read the input
      // payload here without taking a second arg, and the form
      // already needs to advance state on its own. Keep the hook
      // toast-free for success.
      await options?.onSuccess?.(...args);
    },
    onError: (...args) => {
      const [error] = args;
      // CONFLICT = "that email is already registered" — caller
      // inlines a "Sign in instead" link, no toast.
      if (error.data?.code !== "CONFLICT") {
        toast.error(error.message);
      }
      options?.onError?.(...args);
    },
  });
}
