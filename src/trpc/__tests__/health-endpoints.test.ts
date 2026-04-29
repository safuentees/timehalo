import { describe, it, expect, vi } from "vitest";
import { GET as healthGet } from "@/app/api/health/route";
import { GET as readyGet } from "@/app/api/ready/route";
import { prisma } from "@/lib/prisma";

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
    expect(["configured", "unconfigured"]).toContain(body.checks.email);
    expect(["configured", "unconfigured"]).toContain(body.checks.sentry);
  });

  it("returns 503 + status: not-ready when DB check rejects", async () => {
    const spy = vi
      .spyOn(prisma, "$queryRaw")
      .mockRejectedValueOnce(new Error("simulated db outage"));
    try {
      const res = await readyGet();
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.status).toBe("not-ready");
      expect(body.checks.database.status).toBe("error");
      expect(body.checks.database.error).toMatch(/simulated db outage/);
    } finally {
      spy.mockRestore();
    }
  });
});
