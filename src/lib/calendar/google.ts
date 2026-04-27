import "server-only";
import { prisma } from "@/lib/prisma";
import { env } from "@/env";
import type { BusyTime, CalendarAdapter, CalendarSummary } from "./types";

const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_LIST = "https://www.googleapis.com/calendar/v3/users/me/calendarList";
const GOOGLE_FREEBUSY = "https://www.googleapis.com/calendar/v3/freeBusy";
const REFRESH_LEEWAY_MS = 60_000;

export const GOOGLE_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events.readonly",
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
    return credential.accessToken;
  }

  const res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_OAUTH_CLIENT_ID,
      client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
      refresh_token: credential.refreshToken,
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
      accessToken: tokens.access_token,
      accessTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      ...(tokens.refresh_token
        ? { refreshToken: tokens.refresh_token }
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
  };
}
