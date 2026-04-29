import { prisma } from "@/lib/prisma";

type CheckResult =
  | { kind: "ok"; label: string; detail?: string }
  | { kind: "degraded"; label: string; detail?: string }
  | { kind: "down"; label: string; detail?: string };

async function checkDatabase(): Promise<CheckResult> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { kind: "ok", label: "Database" };
  } catch (cause) {
    return {
      kind: "down",
      label: "Database",
      detail: cause instanceof Error ? cause.message : String(cause),
    };
  }
}

function checkEmail(): CheckResult {
  return process.env.RESEND_API_KEY
    ? { kind: "ok", label: "Email (Resend)" }
    : {
        kind: "degraded",
        label: "Email (Resend)",
        detail: "RESEND_API_KEY unset — outbound email is in graceful-skip mode.",
      };
}

function checkSentry(): CheckResult {
  return process.env.NEXT_PUBLIC_SENTRY_DSN
    ? { kind: "ok", label: "Observability (Sentry)" }
    : {
        kind: "degraded",
        label: "Observability (Sentry)",
        detail: "NEXT_PUBLIC_SENTRY_DSN unset — withSpan fall back to dev console.",
      };
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function StatusPage() {
  const [db, email, sentry] = await Promise.all([
    checkDatabase(),
    Promise.resolve(checkEmail()),
    Promise.resolve(checkSentry()),
  ]);
  const checks = [db, email, sentry];
  const overall: "ok" | "degraded" | "down" = checks.some(
    (c) => c.kind === "down",
  )
    ? "down"
    : checks.some((c) => c.kind === "degraded")
      ? "degraded"
      : "ok";

  const overallCopy =
    overall === "ok"
      ? "All systems normal."
      : overall === "degraded"
        ? "Operating with reduced capabilities."
        : "Booking flow disrupted.";
  const overallTone =
    overall === "ok"
      ? "text-bru-content"
      : overall === "degraded"
        ? "opacity-75"
        : "text-bru-content underline";

  return (
    <main className="bru-main">
      <div className="mx-auto w-full max-w-[760px] px-4 py-12 sm:px-6 sm:py-16">
        <p className="bru-legend">
          Officehours / Status
        </p>
        <h1
          className={[
            "mt-4 text-bru-h1 font-black uppercase tracking-tight",
            overallTone,
          ].join(" ")}
        >
          {overallCopy}
        </h1>
        <p className="mt-3 text-[13px] leading-[1.5] opacity-65 font-[family-name:var(--bru-mono)] tabular-nums">
          As of {new Date().toISOString()}
        </p>

        <ul role="list" className="mt-10 flex flex-col gap-3">
          {checks.map((check) => (
            <li
              key={check.label}
              className="border-[1.5px] border-bru-line p-5"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
                <p className="text-[16px] font-black">{check.label}</p>
                <span
                  className={[
                    "font-[family-name:var(--bru-mono)] text-[11px] font-extrabold tracking-[2px] uppercase",
                    check.kind === "ok"
                      ? ""
                      : check.kind === "degraded"
                        ? "opacity-65"
                        : "underline",
                  ].join(" ")}
                >
                  {check.kind === "ok"
                    ? "OK"
                    : check.kind === "degraded"
                      ? "DEGRADED"
                      : "DOWN"}
                </span>
              </div>
              {check.detail ? (
                <p className="mt-2 text-[12px] leading-[1.45] opacity-75">
                  {check.detail}
                </p>
              ) : null}
            </li>
          ))}
        </ul>

        <section className="mt-12 border-t-2 border-bru-line-strong pt-8">
          <p className="bru-eyebrow">
            Notes
          </p>
          <p className="mt-3 max-w-prose text-[13px] leading-[1.55] opacity-75">
            Historical uptime charts arrive when an uptime monitor is
            wired (BetterUptime / UptimeRobot / Vercel built-in).
            Until then this page reflects current state at fetch — no
            cache, no SLA history.
          </p>
          <p className="mt-3 max-w-prose text-[13px] leading-[1.55] opacity-75">
            Programmatic consumers can poll{" "}
            <code className="font-[family-name:var(--bru-mono)] text-[12px]">
              GET /api/health
            </code>{" "}
            (always 200 when the process is alive) or{" "}
            <code className="font-[family-name:var(--bru-mono)] text-[12px]">
              GET /api/ready
            </code>{" "}
            (200 ready / 503 not ready, JSON body with per-check
            detail).
          </p>
        </section>
      </div>
    </main>
  );
}
