import { describe, it, expect } from "vitest";
import { GET as healthGet } from "@/app/api/health/route";
import { GET as readyGet } from "@/app/api/ready/route";

// A15 — minimal contract on /api/health and /api/ready.
// Liveness is unconditional; readiness inspects the DB.

describe("/api/health (liveness)", () => {
  it("always 200, JSON, status: ok", async () => {
    const res = await healthGet();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(typeof body.ts).toBe("string");
  });
});

describe("/api/ready (readiness)", () => {
  it("returns 200 + status: ready when DB is up", async () => {
    const res = await readyGet();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ready");
    expect(body.checks.database.status).toBe("ok");
    // email + sentry are reported as configured/unconfigured; either
    // value is allowed — only the database gate matters for 200/503.
    expect(["configured", "unconfigured"]).toContain(body.checks.email);
    expect(["configured", "unconfigured"]).toContain(body.checks.sentry);
  });
});
