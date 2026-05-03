import "server-only";
import { prisma } from "@/lib/prisma";
import { env } from "@/env";
import { googleAdapter } from "./google";
import { microsoftAdapter } from "./microsoft";
import type { BusyTime, CalendarAdapter } from "./types";
import { subtractBusyTimes } from "./busy-merge";

export type { BusyTime, CalendarAdapter, CalendarSummary } from "./types";
export type { Slot } from "./busy-merge";
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

/**
 * For a set of candidate host ids, return the subset whose connected
 * calendars show them busy at the requested slot. The booking flow
 * passes this set to `selectHost`'s `excludeHostIds` so the round-
 * robin algorithm picks a different host instead of throwing
 * CONFLICT for a multi-host pool that has at least one available
 * member.
 *
 * Per-host fetches run in parallel (Promise.allSettled) so a single
 * slow / failing provider doesn't block the whole pick. A failing
 * fetch is treated as "not busy" — same direction as
 * fetchHostBusyTimes' soft-fail semantics. The alternative (treating
 * fetch failure as "busy, skip this host") would silently degrade
 * round-robin to single-host whenever a provider hiccups.
 *
 * Overlap predicate: half-open `[slotStart, slotEnd)`. A busy event
 * that ends exactly at slotStart, or starts exactly at slotEnd,
 * doesn't conflict — same boundary semantics as `subtractBusyTimes`
 * in `busy-merge.ts`.
 */
export async function findBusyHostIds(opts: {
  hostIds: ReadonlyArray<string>;
  slotStart: Date;
  slotEnd: Date;
}): Promise<Set<string>> {
  if (opts.hostIds.length === 0) return new Set();

  // BusyTime.start/end are ISO UTC strings (see types.ts). ISO 8601
  // UTC sorts lexicographically the same way it sorts chronologically,
  // so string comparison is correct AND avoids allocating Date
  // wrappers on the hot path.
  const slotStartIso = opts.slotStart.toISOString();
  const slotEndIso = opts.slotEnd.toISOString();
  const settled = await Promise.allSettled(
    opts.hostIds.map(async (hostId) => {
      const busy = await fetchHostBusyTimes({
        hostId,
        from: opts.slotStart,
        to: opts.slotEnd,
      });
      const overlaps = busy.some(
        (b) => b.start < slotEndIso && b.end > slotStartIso,
      );
      return overlaps ? hostId : null;
    }),
  );

  const out = new Set<string>();
  for (const r of settled) {
    if (r.status === "fulfilled" && r.value !== null) {
      out.add(r.value);
    }
    // Reject path: same soft-fail as fetchHostBusyTimes — a single
    // adapter hiccup must not silently degrade round-robin to a
    // single host. Treating the reject as "not busy" matches the
    // public host page's same-direction soft-fail.
  }
  return out;
}
