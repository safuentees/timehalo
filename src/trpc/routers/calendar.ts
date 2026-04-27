import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { env } from "@/env";
import {
  getCalendarAdapter,
  googleAuthUrl,
  microsoftAuthUrl,
} from "@/lib/calendar";
import { privateProcedure, router } from "@/trpc/trpc";

// Calendar sub-router (B3). Read-side OAuth flow: connect → list
// calendars → select. Busy times are merged into the public slot
// query (see schedule.getUpcomingSlots above) — there's no separate
// "fetch busy times" procedure on the surface; that pull happens on
// the slot query path.
export const calendar = router({
  // List the host's connected providers + selected-calendar counts.
  // Procedures that touch a specific connection take its `id`.
  connections: privateProcedure.query(async ({ ctx }) => {
    return prisma.calendarCredential.findMany({
      where: { userId: ctx.user.id },
      select: {
        id: true,
        provider: true,
        externalAccountEmail: true,
        createdAt: true,
        _count: { select: { selectedCalendars: true } },
      },
      orderBy: { createdAt: "asc" },
    });
  }),

  // Returns the OAuth consent URL for a provider (or null when the
  // provider isn't configured). The caller redirects the browser
  // there; the callback route at /api/auth/calendar/<provider>/
  // callback exchanges the code + persists a CalendarCredential.
  authUrl: privateProcedure
    .input(
      z.object({
        provider: z.enum(["GOOGLE", "MICROSOFT"]),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const appUrl = env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
      // The state binds the OAuth redirect to the calling user — we
      // verify on callback so a stranger can't drop a refresh_token
      // onto someone else's account by intercepting the redirect.
      // 32 random bytes give us 256 bits of entropy.
      const { randomBytes } = await import("node:crypto");
      const state = `${ctx.user.id}:${randomBytes(32).toString("hex")}`;
      const redirectUri =
        input.provider === "GOOGLE"
          ? `${appUrl}/api/auth/calendar/google/callback`
          : `${appUrl}/api/auth/calendar/microsoft/callback`;
      const url =
        input.provider === "GOOGLE"
          ? googleAuthUrl({ redirectUri, state })
          : microsoftAuthUrl({ redirectUri, state });
      if (!url) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `${input.provider} OAuth is not configured. Set the corresponding env vars.`,
        });
      }
      return { url, state };
    }),

  disconnect: privateProcedure
    .input(z.object({ credentialId: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      // deleteMany scoped to the caller — a stranger can't delete
      // a credential by guessing its id.
      const result = await prisma.calendarCredential.deleteMany({
        where: { id: input.credentialId, userId: ctx.user.id },
      });
      if (result.count === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Credential not found",
        });
      }
      return { ok: true as const };
    }),

  // List calendars on a connected account. Hits the provider's API
  // through the adapter. Errors bubble — the UI shows them inline.
  listCalendars: privateProcedure
    .input(z.object({ credentialId: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const credential = await prisma.calendarCredential.findFirst({
        where: { id: input.credentialId, userId: ctx.user.id },
        select: { id: true, provider: true },
      });
      if (!credential) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Credential not found",
        });
      }
      const adapter = getCalendarAdapter(credential.id, credential.provider);
      if (!adapter) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `${credential.provider} OAuth is not configured`,
        });
      }
      const calendars = await adapter.listCalendars();
      const selected = await prisma.selectedCalendar.findMany({
        where: { credentialId: credential.id },
        select: { externalCalendarId: true },
      });
      const selectedSet = new Set(
        selected.map((s) => s.externalCalendarId),
      );
      return calendars.map((c) => ({
        ...c,
        selected: selectedSet.has(c.externalCalendarId),
      }));
    }),

  // Replace the selection set for a credential. The full set is
  // passed; rows not in the new set get deleted, rows in the new
  // set that don't exist get inserted. Idempotent.
  setSelected: privateProcedure
    .input(
      z.object({
        credentialId: z.string().min(1),
        calendars: z.array(
          z.object({
            externalCalendarId: z.string().min(1),
            summary: z.string().min(1).max(200),
            isPrimary: z.boolean().default(false),
          }),
        ),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const credential = await prisma.calendarCredential.findFirst({
        where: { id: input.credentialId, userId: ctx.user.id },
        select: { id: true },
      });
      if (!credential) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Credential not found",
        });
      }
      const targetIds = new Set(
        input.calendars.map((c) => c.externalCalendarId),
      );
      await prisma.$transaction([
        prisma.selectedCalendar.deleteMany({
          where: {
            credentialId: credential.id,
            externalCalendarId: { notIn: Array.from(targetIds) },
          },
        }),
        ...input.calendars.map((c) =>
          prisma.selectedCalendar.upsert({
            where: {
              credentialId_externalCalendarId: {
                credentialId: credential.id,
                externalCalendarId: c.externalCalendarId,
              },
            },
            create: {
              credentialId: credential.id,
              externalCalendarId: c.externalCalendarId,
              summary: c.summary,
              isPrimary: c.isPrimary,
            },
            update: {
              summary: c.summary,
              isPrimary: c.isPrimary,
            },
          }),
        ),
      ]);
      return { ok: true as const, count: input.calendars.length };
    }),
});
