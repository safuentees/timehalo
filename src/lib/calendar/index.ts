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
  }
  return out;
}
