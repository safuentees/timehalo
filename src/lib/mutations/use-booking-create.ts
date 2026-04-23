"use client";

import { toast } from "sonner";
import { trpc, type ReactQueryOptions } from "@/trpc/hooks";

type Options = ReactQueryOptions["bookings"]["create"];

export function useBookingCreate(options?: Options) {
  return trpc.bookings.create.useMutation({
    ...options,
    onSuccess: async (...args) => {
      toast.success("Booked. Check your email for the confirmation.");
      await options?.onSuccess?.(...args);
    },
    onError: (...args) => {
      const [error] = args;
      toast.error(error.message);
      options?.onError?.(...args);
    },
  });
}
