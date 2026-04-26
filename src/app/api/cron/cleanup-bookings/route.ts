import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";

const log = createLogger("cron.cleanup-bookings");

const RETENTION_DAYS = 30;
const MAX_DELETIONS_PER_RUN = 500;

function isAuthorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  return request.headers.get("authorization") === `Bearer ${expected}`;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000);

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
    log.info("ran (no expired rows)", {
      cutoff: cutoff.toISOString(),
      deleted: 0,
    });
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

  log.info("ran", {
    cutoff: cutoff.toISOString(),
    deleted: result.count,
    sample: expired.slice(0, 5).map((b) => b.publicUid),
  });

  return Response.json({
    ran: new Date().toISOString(),
    cutoff: cutoff.toISOString(),
    deleted: result.count,
    sample: expired.slice(0, 5).map((b) => b.publicUid),
  });
}
