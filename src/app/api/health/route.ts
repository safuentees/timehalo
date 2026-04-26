// Liveness probe — returns 200 as long as the Node process is alive
// and serving HTTP. Deliberately does NOT touch the database, Resend,
// or any other dependency: liveness is "the process is up", and a
// flaky DB shouldn't kill the container. Use /api/ready for the
// dependency-aware variant.
//
// No auth — uptime monitors (BetterUptime, UptimeRobot, Vercel's own
// Health Checks) need to ping this without bearer tokens. The
// response carries no PII; just a static OK.

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    status: "ok",
    ts: new Date().toISOString(),
  });
}
