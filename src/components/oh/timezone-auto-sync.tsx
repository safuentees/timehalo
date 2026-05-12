"use client";

import { useEffect, useRef } from "react";
import { trpc } from "@/trpc/hooks";
import {
  DEFAULT_TIMEZONE,
  getBrowserTimezone,
  timezoneSchema,
} from "@/lib/timezone";

// Auto-set the host's timezone from the browser on first dashboard
// load if the User row still has the schema default ("UTC"). Covers
// the OAuth signup path (GitHub) which bypasses the register form's
// inline timezone capture. Silent — no toast — because the user
// didn't explicitly ask for this. A surfacing toast would read as
// "your timezone changed" and is the wrong vocabulary for an
// automatic correction.
//
// Run-once guarantee: a ref blocks re-fires on the same mount. The
// query also won't re-trigger the effect after invalidation because
// `me.timezone` is no longer "UTC" once the mutation lands.
//
// Skip when:
//  - `me` hasn't loaded yet (no query result)
//  - `me.timezone` is already non-UTC (real or post-fix value)
//  - Browser detection returns "UTC" (no point overwriting UTC with
//    UTC; lets the explicit "Use browser" button in settings handle
//    edge cases where the user genuinely is on UTC)
//  - The detection result fails the canonical IANA-id schema check
//    (a tampered or broken Intl impl shouldn't poison the row).

export function TimezoneAutoSync() {
  const { data: me } = trpc.users.me.useQuery();
  const setTimezone = trpc.users.setTimezone.useMutation();
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    if (!me) return;
    if (me.timezone !== DEFAULT_TIMEZONE) return;

    const detected = getBrowserTimezone();
    if (detected === DEFAULT_TIMEZONE) return;

    const parsed = timezoneSchema.safeParse(detected);
    if (!parsed.success) return;

    fired.current = true;
    setTimezone.mutate({ timezone: parsed.data });
  }, [me, setTimezone]);

  return null;
}
