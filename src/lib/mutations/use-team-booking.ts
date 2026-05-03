"use client";

import { toast } from "sonner";
import { trpc, type ReactQueryOptions } from "@/trpc/hooks";

/**
 * Custom mutation hook for `workspaces.bookForTeam` (B.PT62b).
 * Mirrors `useBookingCreate`'s shape so the team booking flow has
 * the same error/success vocabulary as the personal flow:
 *   - Errors land in a sonner toast with the server's message.
 *   - onSuccess is left to the caller so the page can route to the
 *     `/w/<slug>/<eventTypeSlug>/booked/<uid>` confirmation surface.
 *
 * Global invalidation in `trpc/hooks.ts` refreshes the
 * `workspaces.publicGetUpcomingSlotsForEventType` cache so the
 * booked slot disappears on the next read.
 */

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
