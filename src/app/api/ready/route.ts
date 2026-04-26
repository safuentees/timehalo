import { prisma } from "@/lib/prisma";

// Readiness probe — checks the dependencies the booking flow can't
// run without:
//   • database: a single SELECT 1 round-trip — confirms the
//     connection pool is alive and the DB is accepting queries.
//   • email + sentry are reported as informational fields; their
//     absence doesn't fail readiness because the booking flow
//     gracefully degrades (A1 + observability.ts both no-op when
//     unset). They're surfaced so an operator can `curl /api/ready`
//     and see at a glance which optional sinks are wired.
//
// Returns 503 when the DB check fails so a deploy platform with
// readiness gating won't flip traffic to a broken instance. JSON
// shape stays stable for orchestrators that key off `status`.

export const dynamic = "force-dynamic";

type DbStatus = "ok" | "error";

async function checkDatabase(): Promise<{
  status: DbStatus;
  error?: string;
}> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: "ok" };
  } catch (cause) {
    return {
      status: "error",
      error: cause instanceof Error ? cause.message : String(cause),
    };
  }
}

export async function GET() {
  const db = await checkDatabase();
  const overall = db.status === "ok" ? "ready" : "not-ready";
  const body = {
    status: overall,
    ts: new Date().toISOString(),
    checks: {
      database: db,
      email: process.env.RESEND_API_KEY ? "configured" : "unconfigured",
      sentry: process.env.NEXT_PUBLIC_SENTRY_DSN
        ? "configured"
        : "unconfigured",
    },
  };
  return Response.json(body, {
    status: overall === "ready" ? 200 : 503,
  });
}
