import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { env } from "@/env";
import { exchangeMicrosoftAuthCode } from "@/lib/calendar";
import { encryptToken } from "@/lib/calendar/encryption";

// OAuth callback for Microsoft calendar connect. Mirrors the Google
// callback exactly — state-binding to the initiating user id is the
// only defense against a stranger dropping their tokens onto our
// account, so the gate is identical.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");
  const appUrl = env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";

  if (errorParam) {
    redirect(
      `${appUrl}/settings/calendars?calendarError=${encodeURIComponent(errorParam)}`,
    );
  }
  if (!code || !state) {
    redirect(`${appUrl}/settings/calendars?calendarError=missing_params`);
  }

  const session = await auth();
  if (!session?.user?.id) {
    redirect(`${appUrl}/login`);
  }

  const [stateUserId] = state.split(":");
  if (stateUserId !== session.user.id) {
    redirect(`${appUrl}/settings/calendars?calendarError=state_mismatch`);
  }

  const redirectUri = `${appUrl}/api/auth/calendar/microsoft/callback`;
  try {
    const tokens = await exchangeMicrosoftAuthCode({ code, redirectUri });
    // Encrypt at the persist boundary — see google callback for
    // full reasoning.
    const encryptedAccess = encryptToken(tokens.accessToken);
    const encryptedRefresh = encryptToken(tokens.refreshToken);
    await prisma.calendarCredential.upsert({
      where: {
        userId_provider_externalAccountId: {
          userId: session.user.id,
          provider: "MICROSOFT",
          externalAccountId: tokens.externalAccountId,
        },
      },
      create: {
        userId: session.user.id,
        provider: "MICROSOFT",
        externalAccountId: tokens.externalAccountId,
        externalAccountEmail: tokens.externalAccountEmail,
        accessToken: encryptedAccess,
        refreshToken: encryptedRefresh,
        accessTokenExpiresAt: tokens.expiresAt,
        scope: tokens.scope,
      },
      update: {
        accessToken: encryptedAccess,
        refreshToken: encryptedRefresh,
        accessTokenExpiresAt: tokens.expiresAt,
        scope: tokens.scope,
        externalAccountEmail: tokens.externalAccountEmail,
      },
    });
  } catch {
    redirect(`${appUrl}/settings/calendars?calendarError=exchange_failed`);
  }
  redirect(`${appUrl}/settings/calendars?calendarConnected=microsoft`);
}
