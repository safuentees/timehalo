import "server-only";
import { prisma } from "@/lib/prisma";
import { env } from "@/env";
import { googleAdapter } from "./google";
import { microsoftAdapter } from "./microsoft";
import type { BusyTime, CalendarAdapter } from "./types";
import { subtractBusyTimes } from "./busy-merge";

export type { BusyTime, CalendarAdapter, CalendarSummary } from "./types";
export { subtractBusyTimes };
export {
  googleAuthUrl,
  exchangeGoogleAuthCode,
  GOOGLE_OAUTH_SCOPES,
} from "./google";
export {
  microsoftAuthUrl,
  exchangeMicrosoftAuthCode,
  MICROSOFT_OAUTH_SCOPES,
} from "./microsoft";

// Adapter factory — picks the right implementation by provider.
// Returns null when the provider's OAuth client isn't configured (the
// adapter would 401 every call) so call sites can short-circuit.
export function getCalendarAdapter(
  credentialId: string,
  provider: "GOOGLE" | "MICROSOFT",
): CalendarAdapter | null {
  if (provider === "GOOGLE") {
    if (!env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET) {
      return null;
    }
    return googleAdapter(credentialId);
  }
  if (provider === "MICROSOFT") {
    if (!env.MICROSOFT_OAUTH_CLIENT_ID || !env.MICROSOFT_OAUTH_CLIENT_SECRET) {
      return null;
    }
    return microsoftAdapter(credentialId);
  }
  return null;
}

/**
 * For a given host, gather busy ranges across every selected calendar
 * on every credential. Adapter calls run in parallel; per-credential
 * failures swallow (logged via observability) so a single broken
 * connection doesn't black out the slot picker.
 */
export async function fetchHostBusyTimes(opts: {
  hostId: string;
  from: Date;
  to: Date;
}): Promise<BusyTime[]> {
  const credentials = await prisma.calendarCredential.findMany({
    where: { userId: opts.hostId },
    select: {
      id: true,
      provider: true,
      selectedCalendars: {
        select: { externalCalendarId: true },
      },
    },
  });
  if (credentials.length === 0) return [];

  const results = await Promise.allSettled(
    credentials.map(async (c) => {
      if (c.selectedCalendars.length === 0) return [] as BusyTime[];
      const adapter = getCalendarAdapter(c.id, c.provider);
      if (!adapter) return [] as BusyTime[];
      return adapter.getBusyTimes({
        calendarIds: c.selectedCalendars.map((s) => s.externalCalendarId),
        from: opts.from,
        to: opts.to,
      });
    }),
  );

  const out: BusyTime[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") {
      out.push(...r.value);
    }
    // Reject path: log + continue. Don't 500 the public host page
    // because one provider is having a bad day.
  }
  return out;
}
