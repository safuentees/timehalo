import "server-only";
import { prisma } from "@/lib/prisma";
import { env } from "@/env";
import type { BusyTime, CalendarAdapter, CalendarSummary } from "./types";

const MS_TOKEN_ENDPOINT =
  "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const MS_CALENDARS = "https://graph.microsoft.com/v1.0/me/calendars";
const MS_GETSCHEDULE =
  "https://graph.microsoft.com/v1.0/me/calendar/getSchedule";
const REFRESH_LEEWAY_MS = 60_000;

export const MICROSOFT_OAUTH_SCOPES = [
  "offline_access",
  "Calendars.Read",
  "User.Read",
  "openid",
  "email",
  "profile",
] as const;

export function microsoftAuthUrl(opts: {
  redirectUri: string;
  state: string;
}): string | null {
  if (!env.MICROSOFT_OAUTH_CLIENT_ID) return null;
  const params = new URLSearchParams({
    client_id: env.MICROSOFT_OAUTH_CLIENT_ID,
    redirect_uri: opts.redirectUri,
    response_type: "code",
    response_mode: "query",
    scope: MICROSOFT_OAUTH_SCOPES.join(" "),
    state: opts.state,
  });
  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
}

export async function exchangeMicrosoftAuthCode(opts: {
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
  if (!env.MICROSOFT_OAUTH_CLIENT_ID || !env.MICROSOFT_OAUTH_CLIENT_SECRET) {
    throw new Error("Microsoft OAuth not configured");
  }
  const res = await fetch(MS_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.MICROSOFT_OAUTH_CLIENT_ID,
      client_secret: env.MICROSOFT_OAUTH_CLIENT_SECRET,
      redirect_uri: opts.redirectUri,
      code: opts.code,
      grant_type: "authorization_code",
    }).toString(),
  });
  if (!res.ok) {
    throw new Error(
      `Microsoft token exchange failed: ${res.status} ${await res.text()}`,
    );
  }
  const tokens = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
    id_token?: string;
  };
  if (!tokens.refresh_token) {
    throw new Error(
      "Microsoft did not return a refresh_token. Did you include offline_access in scope?",
    );
  }
  const claims = tokens.id_token ? decodeJwtSafe(tokens.id_token) : null;
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    scope: tokens.scope,
    externalAccountId: claims?.oid ?? claims?.sub ?? "unknown",
    externalAccountEmail: claims?.email ?? claims?.preferred_username ?? null,
  };
}

function decodeJwtSafe(jwt: string): {
  sub?: string;
  oid?: string;
  email?: string;
  preferred_username?: string;
} | null {
  try {
    const [, payload] = jwt.split(".");
    if (!payload) return null;
    const padded = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(padded, "base64").toString("utf-8");
    return JSON.parse(json) as Record<string, string>;
  } catch {
    return null;
  }
}

async function refreshMicrosoftToken(credentialId: string): Promise<string> {
  if (!env.MICROSOFT_OAUTH_CLIENT_ID || !env.MICROSOFT_OAUTH_CLIENT_SECRET) {
    throw new Error("Microsoft OAuth not configured");
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
  const res = await fetch(MS_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.MICROSOFT_OAUTH_CLIENT_ID,
      client_secret: env.MICROSOFT_OAUTH_CLIENT_SECRET,
      refresh_token: credential.refreshToken,
      grant_type: "refresh_token",
      scope: ["offline_access", "Calendars.Read"].join(" "),
    }).toString(),
  });
  if (!res.ok) {
    throw new Error(
      `Microsoft token refresh failed: ${res.status} ${await res.text()}`,
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

export function microsoftAdapter(credentialId: string): CalendarAdapter {
  return {
    provider: "MICROSOFT",
    async listCalendars(): Promise<CalendarSummary[]> {
      const accessToken = await refreshMicrosoftToken(credentialId);
      const res = await fetch(MS_CALENDARS, {
        headers: { authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        throw new Error(`Microsoft calendars failed: ${res.status}`);
      }
      const body = (await res.json()) as {
        value?: Array<{
          id: string;
          name?: string;
          isDefaultCalendar?: boolean;
        }>;
      };
      return (body.value ?? []).map((c) => ({
        externalCalendarId: c.id,
        summary: c.name ?? c.id,
        isPrimary: c.isDefaultCalendar ?? false,
      }));
    },
    async getBusyTimes(opts): Promise<BusyTime[]> {
      if (opts.calendarIds.length === 0) return [];
      const accessToken = await refreshMicrosoftToken(credentialId);
      const owner = await prisma.calendarCredential.findUniqueOrThrow({
        where: { id: credentialId },
        select: { externalAccountEmail: true },
      });
      if (!owner.externalAccountEmail) return [];
      const res = await fetch(MS_GETSCHEDULE, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          schedules: [owner.externalAccountEmail],
          startTime: { dateTime: opts.from.toISOString(), timeZone: "UTC" },
          endTime: { dateTime: opts.to.toISOString(), timeZone: "UTC" },
          availabilityViewInterval: 15,
        }),
      });
      if (!res.ok) {
        throw new Error(`Microsoft getSchedule failed: ${res.status}`);
      }
      const body = (await res.json()) as {
        value?: Array<{
          scheduleItems?: Array<{
            status: string;
            start: { dateTime: string };
            end: { dateTime: string };
          }>;
        }>;
      };
      const out: BusyTime[] = [];
      for (const sched of body.value ?? []) {
        for (const item of sched.scheduleItems ?? []) {
          if (item.status === "free") continue;
          out.push({
            start: new Date(item.start.dateTime + "Z").toISOString(),
            end: new Date(item.end.dateTime + "Z").toISOString(),
          });
        }
      }
      return out;
    },
  };
}
