"use client";

import { toast } from "sonner";
import { trpc, type ReactQueryOptions } from "@/trpc/hooks";

// Custom mutation hook for `billing.openPortal`. Returns `{ url }`
// pointing at Stripe's hosted Customer Portal. The portal is where
// the user manages payment method, downloads invoices, switches plan,
// and cancels — all configured Stripe-side, no code in this app.
//
// PRECONDITION_FAILED fires when the workspace has no
// `stripeCustomerId` yet (never completed a checkout). The caller
// should hide the Manage button when `currentPlan.hasStripeCustomer`
// is false; this guard is the second line of defense.

type Options = ReactQueryOptions["billing"]["openPortal"];

export function useBillingPortal(options?: Options) {
  return trpc.billing.openPortal.useMutation({
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
