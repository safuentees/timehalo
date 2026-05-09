"use client";

import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { trpc, type ReactQueryOptions } from "@/trpc/hooks";

/**
 * Custom mutation hook for `users.setDurationsList` (B.PT274). Shows a
 * success toast when the host's duration allow-list is updated. Errors
 * surface as toasts; the editor itself doesn't render inline errors
 * (the schema is range/cap-bound — bad input is the only failure mode
 * and is already prevented by the editor's UI guards).
 */

type Options = ReactQueryOptions["users"]["setDurationsList"];

export function useSetDurations(options?: Options) {
  const t = useTranslations("Profile");
  return trpc.users.setDurationsList.useMutation({
    ...options,
    onSuccess: async (...args) => {
      toast.success(t("durationsSavedToast"));
      await options?.onSuccess?.(...args);
    },
    onError: (...args) => {
      const [error] = args;
      toast.error(error.message);
      options?.onError?.(...args);
    },
  });
}
