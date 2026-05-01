import "server-only";
import { prisma } from "@/lib/prisma";
import { env } from "@/env";
import { decryptToken, encryptToken } from "./encryption";
import type { BusyTime, CalendarAdapter, CalendarSummary } from "./types";

// Google Calendar adapter. Uses Google's REST API directly (the
// `googleapis` SDK is a heavy dep when only freebusy + calendarList
// are needed). Token refresh runs against
// https://oauth2.googleapis.com/token with grant_type=refresh_token.
//
// Pattern reference: c7-verified Google OAuth2 flow. Refresh-token
// rotation: Google sometimes returns a new refresh_token alongside
// the access_token; we persist whichever value Google gave us (the
// old one keeps working but the new one supersedes).

const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_LIST = "https://www.googleapis.com/calendar/v3/users/me/calendarList";
const GOOGLE_FREEBUSY = "https://www.googleapis.com/calendar/v3/freeBusy";
const GOOGLE_EVENTS = (calendarId: string) =>
  `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
const GOOGLE_EVENT = (calendarId: string, eventId: string) =>
  `${GOOGLE_EVENTS(calendarId)}/${encodeURIComponent(eventId)}`;
// Refresh slightly before the upstream expiry so we don't race a
// just-expired token into a 401.
const REFRESH_LEEWAY_MS = 60_000;

// Split-grain scope set — reads the calendar list (so the "Manage
// calendars" modal can populate) AND reads/writes events (so two-way
// calendar write actually works: bookings.create / .reschedule /
// .cancel call adapter.createEvent / updateEvent / deleteEvent).
//
// Original scopes were `.readonly` only and blocked events.insert
// with `ACCESS_TOKEN_SCOPE_INSUFFICIENT` at write time. cal.com uses
// the broader `https://www.googleapis.com/auth/calendar` (full RW
// across calendar list + events); we split-grain because the user
// only needs events RW + calendar list READ — no need to grant the
// calendar settings tampering permission that the broader scope
// implies.
//
// `calendar.events` is read+write on events (subsumes the previous
// `calendar.events.readonly`, so that scope is dropped).
// `calendar.readonly` covers calendarList + read access for the
// busy-times pull. Reference: developers.google.com/identity/protocols
// /oauth2/scopes#calendar.
export const GOOGLE_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
  "openid",
  "email",
  "profile",
] as const;

export function googleAuthUrl(opts: {
  redirectUri: string;
  state: string;
}): string | null {
  if (!env.GOOGLE_OAUTH_CLIENT_ID) return null;
  const params = new URLSearchParams({
    client_id: env.GOOGLE_OAUTH_CLIENT_ID,
    redirect_uri: opts.redirectUri,
    response_type: "code",
    scope: GOOGLE_OAUTH_SCOPES.join(" "),
    access_type: "offline",
    // Force consent so refresh_token is reliably issued on every
    // first-time connect (Google omits it on subsequent OAuths
    // unless prompted).
    prompt: "consent",
    state: opts.state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeGoogleAuthCode(opts: {
  code: string;
  redirectUri: string;
}): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scope: string;
  externalAccountId: string;
  externalAccountEmail: string | null;
}> {
  if (!env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET) {
    throw new Error("Google OAuth not configured");
  }
  const tokenRes = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: opts.code,
      client_id: env.GOOGLE_OAUTH_CLIENT_ID,
      client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
      redirect_uri: opts.redirectUri,
      grant_type: "authorization_code",
    }).toString(),
  });
  if (!tokenRes.ok) {
    throw new Error(
      `Google token exchange failed: ${tokenRes.status} ${await tokenRes.text()}`,
    );
  }
  const tokens = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
    id_token?: string;
  };
  if (!tokens.refresh_token) {
    // Without a refresh_token we can't keep the connection live past
    // the first hour. Reject — the user will need to reconnect with
    // prompt=consent (which we always send, so this is rare).
    throw new Error(
      "Google did not return a refresh_token. Disconnect + reconnect.",
    );
  }
  const claims = tokens.id_token ? decodeJwtSafe(tokens.id_token) : null;
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    scope: tokens.scope,
    externalAccountId: claims?.sub ?? "unknown",
    externalAccountEmail: claims?.email ?? null,
  };
}

function decodeJwtSafe(jwt: string): { sub?: string; email?: string } | null {
  try {
    const [, payload] = jwt.split(".");
    if (!payload) return null;
    // base64url → base64
    const padded = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(padded, "base64").toString("utf-8");
    return JSON.parse(json) as { sub?: string; email?: string };
  } catch {
    return null;
  }
}

async function refreshGoogleToken(credentialId: string): Promise<string> {
  if (!env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET) {
    throw new Error("Google OAuth not configured");
  }
  const credential = await prisma.calendarCredential.findUniqueOrThrow({
    where: { id: credentialId },
    select: { refreshToken: true, accessTokenExpiresAt: true, accessToken: true },
  });
  if (
    credential.accessTokenExpiresAt.getTime() - REFRESH_LEEWAY_MS >
    Date.now()
  ) {
    return decryptToken(credential.accessToken);
  }

  const res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_OAUTH_CLIENT_ID,
      client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
      refresh_token: decryptToken(credential.refreshToken),
      grant_type: "refresh_token",
    }).toString(),
  });
  if (!res.ok) {
    throw new Error(
      `Google token refresh failed: ${res.status} ${await res.text()}`,
    );
  }
  const tokens = (await res.json()) as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
  };
  await prisma.calendarCredential.update({
    where: { id: credentialId },
    data: {
      accessToken: encryptToken(tokens.access_token),
      accessTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      ...(tokens.refresh_token
        ? { refreshToken: encryptToken(tokens.refresh_token) }
        : {}),
    },
  });
  return tokens.access_token;
}

export function googleAdapter(credentialId: string): CalendarAdapter {
  return {
    provider: "GOOGLE",
    async listCalendars(): Promise<CalendarSummary[]> {
      const accessToken = await refreshGoogleToken(credentialId);
      const res = await fetch(GOOGLE_CALENDAR_LIST, {
        headers: { authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        throw new Error(`Google calendarList failed: ${res.status}`);
      }
      const body = (await res.json()) as {
        items?: Array<{
          id: string;
          summary?: string;
          primary?: boolean;
        }>;
      };
      return (body.items ?? []).map((c) => ({
        externalCalendarId: c.id,
        summary: c.summary ?? c.id,
        isPrimary: c.primary ?? false,
      }));
    },
    async getBusyTimes(opts): Promise<BusyTime[]> {
      if (opts.calendarIds.length === 0) return [];
      const accessToken = await refreshGoogleToken(credentialId);
      const res = await fetch(GOOGLE_FREEBUSY, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          timeMin: opts.from.toISOString(),
          timeMax: opts.to.toISOString(),
          items: opts.calendarIds.map((id) => ({ id })),
        }),
      });
      if (!res.ok) {
        throw new Error(`Google freeBusy failed: ${res.status}`);
      }
      const body = (await res.json()) as {
        calendars?: Record<
          string,
          { busy?: Array<{ start: string; end: string }> }
        >;
      };
      const out: BusyTime[] = [];
      for (const cal of Object.values(body.calendars ?? {})) {
        for (const range of cal.busy ?? []) {
          out.push({ start: range.start, end: range.end });
        }
      }
      return out;
    },
    // ─── B2 — two-way write ──────────────────────────────────────
    async createEvent(input) {
      const accessToken = await refreshGoogleToken(credentialId);
      const res = await fetch(GOOGLE_EVENTS(input.calendarId), {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(buildGoogleEventBody(input)),
      });
      if (!res.ok) {
        throw new Error(
          `Google events.insert failed: ${res.status} ${await res.text()}`,
        );
      }
      const event = (await res.json()) as { id: string };
      return { externalEventId: event.id };
    },
    async updateEvent(externalEventId, input) {
      const accessToken = await refreshGoogleToken(credentialId);
      const res = await fetch(
        GOOGLE_EVENT(input.calendarId, externalEventId),
        {
          method: "PATCH",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify(buildGoogleEventBody(input)),
        },
      );
      // 404 → event already gone upstream. Idempotent — no-op.
      if (res.status === 404) return;
      if (!res.ok) {
        throw new Error(
          `Google events.patch failed: ${res.status} ${await res.text()}`,
        );
      }
    },
    async deleteEvent(opts) {
      const accessToken = await refreshGoogleToken(credentialId);
      const res = await fetch(
        GOOGLE_EVENT(opts.calendarId, opts.externalEventId),
        {
          method: "DELETE",
          headers: { authorization: `Bearer ${accessToken}` },
        },
      );
      // 404 / 410 → event already gone. Idempotent.
      if (res.status === 404 || res.status === 410) return;
      if (!res.ok) {
        throw new Error(
          `Google events.delete failed: ${res.status} ${await res.text()}`,
        );
      }
    },
  };
}

// Google Calendar event body shape. start/end use `dateTime` +
// `timeZone: UTC` since we hold all booking times as UTC instants;
// Google renders them in the host's calendar zone automatically.
// `attendees` makes the visitor show up in the host's invite list
// + sends them an email when `sendUpdates: all` is set on the
// request URL — but we POST without sendUpdates so the provider
// only writes to the host's calendar. Visitor-side notifications
// are this app's responsibility (booking-created template).
type GoogleEventBody = {
  summary: string;
  description?: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  attendees?: Array<{ email: string; displayName?: string }>;
};
function buildGoogleEventBody(input: {
  title: string;
  description?: string;
  start: Date;
  end: Date;
  attendeeEmail?: string;
  attendeeName?: string;
}): GoogleEventBody {
  return {
    summary: input.title,
    ...(input.description ? { description: input.description } : {}),
    start: { dateTime: input.start.toISOString(), timeZone: "UTC" },
    end: { dateTime: input.end.toISOString(), timeZone: "UTC" },
    ...(input.attendeeEmail
      ? {
          attendees: [
            {
              email: input.attendeeEmail,
              ...(input.attendeeName
                ? { displayName: input.attendeeName }
                : {}),
            },
          ],
        }
      : {}),
  };
}
