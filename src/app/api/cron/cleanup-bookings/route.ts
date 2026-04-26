import { prisma } from "@/lib/prisma";

// Cleanup cron — hard-deletes soft-deleted bookings past the
// retention window. Audit rows survive because BookingAudit has no
// FK to Booking (intentional design — see prisma/schema.prisma's
// BookingAudit comment block).
//
// Auth pattern matches /api/cron/process-tasks: Authorization:
// Bearer ${CRON_SECRET}. Vercel Cron sets the header automatically
// when CRON_SECRET is set in the project's env vars.
//
// Schedule: daily (vercel.json). Daily is enough — soft-deleted rows
// don't grow unbounded and don't impact reads (filtered out at
// query time). The cron is more about preventing long-term
// table bloat than urgent cleanup.

const RETENTION_DAYS = 30;
const MAX_DELETIONS_PER_RUN = 500;

function isAuthorized(request: Request): boolean {
  // See note in process-tasks/route.ts — CRON_SECRET stays on raw
  // process.env so test setup + Vercel cron mutations survive.
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  return request.headers.get("authorization") === `Bearer ${expected}`;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000);

  // Find first, then deleteMany on the IDs. Two-step so we can return
  // the count + sample of what was hard-deleted (useful for cron-run
  // logs / observability piping). Cap at MAX_DELETIONS_PER_RUN so a
  // backlog after a long pause doesn't time out the function.
  const expired = await prisma.booking.findMany({
    where: {
      deleted: true,
      deletedAt: { lte: cutoff },
    },
    select: { id: true, publicUid: true },
    take: MAX_DELETIONS_PER_RUN,
    orderBy: { deletedAt: "asc" },
  });

  if (expired.length === 0) {
    return Response.json({
      ran: new Date().toISOString(),
      cutoff: cutoff.toISOString(),
      deleted: 0,
    });
  }

  const ids = expired.map((b) => b.id);
  const result = await prisma.booking.deleteMany({
    where: { id: { in: ids } },
  });

  return Response.json({
    ran: new Date().toISOString(),
    cutoff: cutoff.toISOString(),
    deleted: result.count,
    // Sample so cron logs can show what got removed without exposing
    // the full list. publicUid is stable + already public in URLs.
    sample: expired.slice(0, 5).map((b) => b.publicUid),
  });
}
