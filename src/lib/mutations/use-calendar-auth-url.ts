"use client";

import { toast } from "sonner";
import { trpc, type ReactQueryOptions } from "@/trpc/hooks";

// Custom mutation hook for `calendar.authUrl`. The procedure returns
// `{ url, state }`; the OAuth handoff has to be initiated from the
// client (a server-side redirect would be cross-origin), so this hook
// pushes `window.location.href = url` on success.
//
// `PRECONDITION_FAILED` (provider not configured — env vars unset)
// surfaces inline in the calling component, so we suppress the
// generic toast on that code and let the caller render the inline
// message instead.

type Options = ReactQueryOptions["calendar"]["authUrl"];

export function useCalendarAuthUrl(options?: Options) {
  return trpc.calendar.authUrl.useMutation({
    ...options,
    onSuccess: async (...args) => {
      const [data] = args;
      await options?.onSuccess?.(...args);
      // Hand the browser to the provider's consent screen. Hard
      // navigation, not router.push — the destination is cross-origin.
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
