import { describe, it, expect } from "vitest";
import {
  redactEmailString,
  redactSentryEvent,
  redactValue,
} from "@/lib/sentry-redact";

describe("redactEmailString", () => {
  it("partial-masks emails inside any string", () => {
    expect(redactEmailString("hi maya@example.com please")).toBe(
      "hi may***@example.com please",
    );
  });

  it("handles multiple emails in one string", () => {
    expect(redactEmailString("from a@x.io to b@y.io")).toBe(
      "from a***@x.io to b***@y.io",
    );
  });

  it("returns non-email strings unchanged", () => {
    expect(redactEmailString("nothing to redact")).toBe("nothing to redact");
  });
});

describe("redactValue", () => {
  it("redacts PII-keyed values to <redacted>", () => {
    const r = redactValue({
      email: "maya@example.com",
      visitorName: "Maya",
      notes: "private",
      handle: "pangs", // not PII-keyed
    }) as Record<string, string>;
    expect(r.email).toBe("<redacted>");
    expect(r.visitorName).toBe("<redacted>");
    expect(r.notes).toBe("<redacted>");
    expect(r.handle).toBe("pangs");
  });

  it("recurses into nested objects + arrays", () => {
    const r = redactValue({
      booking: {
        visitorEmail: "a@x.io",
        slot: { day: "MONDAY", time: "10:00" },
      },
      log: ["before maya@example.com after"],
    }) as { booking: { visitorEmail: string; slot: { day: string } }; log: string[] };
    expect(r.booking.visitorEmail).toBe("<redacted>");
    expect(r.booking.slot.day).toBe("MONDAY");
    expect(r.log[0]).toBe("before may***@example.com after");
  });
});

describe("redactSentryEvent", () => {
  it("scrubs event.extra + breadcrumbs.data + exception.values", () => {
    const e = redactSentryEvent({
      message: "booking failed for maya@example.com",
      extra: { visitorEmail: "maya@example.com", booking: { ok: false } },
      breadcrumbs: [
        {
          message: "POST /booking with maya@example.com",
          data: { to: "maya@example.com", template: "booking-confirm" },
        },
      ],
      exception: {
        values: [
          { value: "TRPCError: visitor email maya@example.com rejected" },
        ],
      },
    } as unknown as Parameters<typeof redactSentryEvent>[0]) as unknown as {
      message: string;
      extra: { visitorEmail: string; booking: { ok: boolean } };
      breadcrumbs: Array<{
        message: string;
        data: { to: string; template: string };
      }>;
      exception: { values: Array<{ value: string }> };
    };
    expect(e.message).toBe("booking failed for may***@example.com");
    expect(e.extra.visitorEmail).toBe("<redacted>");
    expect(e.extra.booking.ok).toBe(false);
    expect(e.breadcrumbs[0].message).toBe(
      "POST /booking with may***@example.com",
    );
    expect(e.breadcrumbs[0].data.to).toBe("<redacted>");
    expect(e.breadcrumbs[0].data.template).toBe("booking-confirm");
    expect(e.exception.values[0].value).toBe(
      "TRPCError: visitor email may***@example.com rejected",
    );
  });
});
