"use client";

import { toast } from "sonner";
import { trpc, type ReactQueryOptions } from "@/trpc/hooks";

// Custom mutation hook for `billing.startCheckout`. The procedure
// returns `{ url }` — Stripe Checkout's hosted payment page. Same
// shape as `calendar.authUrl` (cross-origin handoff), so the hook
// hands the browser off via `window.location.href` rather than
// `router.push`. Hard navigation, not client routing.
//
// `PRECONDITION_FAILED` (Stripe env unset) surfaces inline in the
// caller — suppress the generic error toast for that one code so the
// settings UI can show the actionable "Stripe is not configured"
// message instead of a transient toast.

type Options = ReactQueryOptions["billing"]["startCheckout"];

export function useBillingCheckout(options?: Options) {
  return trpc.billing.startCheckout.useMutation({
    ...options,
    onSuccess: async (...args) => {
      const [data] = args;
      await options?.onSuccess?.(...args);
      window.location.href = data.url;
    },
    onError: (...args) => {
      const [error] = args;
      if (error.data?.code !== "PRECONDITION_FAILED") {
        toast.error(error.message);
      }
      options?.onError?.(...args);
    },
  });
}
