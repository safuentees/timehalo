import { describe, it, expect, vi } from "vitest";
import { createHmac } from "node:crypto";
import { POST as stripeWebhook } from "@/app/api/stripe/webhook/route";
import {
  hasFeature,
  memberCap,
  planFromStripePriceId,
  verifyStripeSignature,
} from "@/lib/billing";
import { prisma } from "@/lib/prisma";

describe("plan feature matrix", () => {
  it("FREE grants only the basics", () => {
    expect(hasFeature("FREE", "bookings.unlimited")).toBe(true);
    expect(hasFeature("FREE", "webhooks")).toBe(false);
    expect(hasFeature("FREE", "round-robin")).toBe(false);
  });

  it("PRO grants webhooks + api-keys + workflows", () => {
    expect(hasFeature("PRO", "webhooks")).toBe(true);
    expect(hasFeature("PRO", "api-keys")).toBe(true);
    expect(hasFeature("PRO", "workflows")).toBe(true);
    expect(hasFeature("PRO", "round-robin")).toBe(false);
  });

  it("TEAM grants round-robin + priority-support", () => {
    expect(hasFeature("TEAM", "round-robin")).toBe(true);
    expect(hasFeature("TEAM", "priority-support")).toBe(true);
  });

  it("memberCap matches the matrix", () => {
    expect(memberCap("FREE")).toBe(1);
    expect(memberCap("PRO")).toBe(5);
    expect(memberCap("TEAM")).toBe(25);
  });
});

describe("planFromStripePriceId", () => {
  it("returns FREE when null or unknown", () => {
    expect(planFromStripePriceId(null)).toBe("FREE");
    expect(planFromStripePriceId("price_unknown")).toBe("FREE");
  });

  it("respects STRIPE_PRICE_PRO env", () => {
    vi.stubEnv("STRIPE_PRICE_PRO", "price_pro_test");
    try {
      expect(planFromStripePriceId("price_pro_test")).toBe("PRO");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("verifyStripeSignature", () => {
  const secret = "whsec_test_secret";

  function sign(rawBody: string, ts: number): string {
    const sig = createHmac("sha256", secret)
      .update(`${ts}.${rawBody}`)
      .digest("hex");
    return `t=${ts},v1=${sig}`;
  }

  it("accepts a valid signature within tolerance", () => {
    const body = '{"id":"evt_1"}';
    const ts = Math.floor(Date.now() / 1000);
    const verdict = verifyStripeSignature({
      rawBody: body,
      header: sign(body, ts),
      signingSecret: secret,
    });
    expect(verdict.valid).toBe(true);
  });

  it("rejects a missing header", () => {
    const verdict = verifyStripeSignature({
      rawBody: "{}",
      header: null,
      signingSecret: secret,
    });
    expect(verdict.valid).toBe(false);
    expect(verdict.reason).toBe("missing-header");
  });

  it("rejects a malformed header", () => {
    const verdict = verifyStripeSignature({
      rawBody: "{}",
      header: "not-a-real-header",
      signingSecret: secret,
    });
    expect(verdict.valid).toBe(false);
  });

  it("rejects when timestamp is outside the tolerance window", () => {
    const body = "{}";
    const stale = Math.floor(Date.now() / 1000) - 10 * 60; // 10 min ago
    const verdict = verifyStripeSignature({
      rawBody: body,
      header: sign(body, stale),
      signingSecret: secret,
    });
    expect(verdict.valid).toBe(false);
    expect(verdict.reason).toBe("stale");
  });

  it("rejects a tampered body", () => {
    const original = '{"id":"evt_1"}';
    const ts = Math.floor(Date.now() / 1000);
    const verdict = verifyStripeSignature({
      rawBody: '{"id":"evt_2"}', // tampered
      header: sign(original, ts),
      signingSecret: secret,
    });
    expect(verdict.valid).toBe(false);
  });
});

describe("/api/stripe/webhook handler", () => {
  it("returns 503 when STRIPE_WEBHOOK_SECRET unset", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", undefined as unknown as string);
    try {
      const res = await stripeWebhook(
        new Request("http://localhost/api/stripe/webhook", {
          method: "POST",
          body: "{}",
        }),
      );
      expect(res.status).toBe(503);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("returns 400 on missing/invalid signature", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
    try {
      const res = await stripeWebhook(
        new Request("http://localhost/api/stripe/webhook", {
          method: "POST",
          body: '{"id":"evt_x"}',
          headers: { "stripe-signature": "garbage" },
        }),
      );
      expect(res.status).toBe(400);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("dedups on event.id (second send returns duplicate=true)", async () => {
    const secret = "whsec_dedup_test";
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", secret);
    const body = JSON.stringify({
      id: `evt_dedup_${Date.now()}`,
      type: "ping.unhandled",
    });
    const ts = Math.floor(Date.now() / 1000);
    const sig = createHmac("sha256", secret)
      .update(`${ts}.${body}`)
      .digest("hex");
    try {
      const first = await stripeWebhook(
        new Request("http://localhost/api/stripe/webhook", {
          method: "POST",
          body,
          headers: { "stripe-signature": `t=${ts},v1=${sig}` },
        }),
      );
      expect(first.status).toBe(200);
      const second = await stripeWebhook(
        new Request("http://localhost/api/stripe/webhook", {
          method: "POST",
          body,
          headers: { "stripe-signature": `t=${ts},v1=${sig}` },
        }),
      );
      const json = await second.json();
      expect(json.duplicate).toBe(true);
    } finally {
      vi.unstubAllEnvs();
      await prisma.stripeEvent.deleteMany({
        where: { type: "ping.unhandled" },
      });
    }
  });
});
