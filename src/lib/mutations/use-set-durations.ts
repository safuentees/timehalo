"use client";

import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { trpc, type ReactQueryOptions } from "@/trpc/hooks";

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
