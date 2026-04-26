import { prisma } from "@/lib/prisma";

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
