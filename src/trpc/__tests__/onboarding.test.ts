import { describe, it, expect } from "vitest";
import {
  computeOnboardingSteps,
  isComplete,
  progress,
} from "@/lib/onboarding";

// A6 — pure logic tests for the onboarding state machine.
// The React component renders this; rendering is exercised in
// Playwright. Vitest locks down the data → checked-state mapping.

const baseInputs = {
  handle: null,
  timezone: "UTC",
  availabilityCount: 0,
  bookingsCount: 0,
  manuallyDone: new Set<never>(),
};

describe("onboarding — step derivation", () => {
  it("starts with everything pending", () => {
    const steps = computeOnboardingSteps(baseInputs);
    expect(steps.length).toBe(5);
    expect(steps.every((s) => !s.done)).toBe(true);
  });

  it("checks handle when set", () => {
    const steps = computeOnboardingSteps({
      ...baseInputs,
      handle: "alex",
    });
    expect(steps.find((s) => s.id === "handle")?.done).toBe(true);
  });

  it("does not check timezone when still UTC default", () => {
    const steps = computeOnboardingSteps({
      ...baseInputs,
      timezone: "UTC",
    });
    expect(steps.find((s) => s.id === "timezone")?.done).toBe(false);
  });

  it("checks timezone when changed away from UTC", () => {
    const steps = computeOnboardingSteps({
      ...baseInputs,
      timezone: "America/New_York",
    });
    expect(steps.find((s) => s.id === "timezone")?.done).toBe(true);
  });

  it("checks availability when at least one range exists", () => {
    const steps = computeOnboardingSteps({
      ...baseInputs,
      availabilityCount: 1,
    });
    expect(steps.find((s) => s.id === "availability")?.done).toBe(true);
  });

  it("share is manual — only checks when explicitly marked", () => {
    const noMark = computeOnboardingSteps(baseInputs);
    expect(noMark.find((s) => s.id === "share")?.done).toBe(false);

    const marked = computeOnboardingSteps({
      ...baseInputs,
      manuallyDone: new Set(["share"]),
    });
    expect(marked.find((s) => s.id === "share")?.done).toBe(true);
  });

  it("first-booking auto-checks when bookings exist", () => {
    const steps = computeOnboardingSteps({
      ...baseInputs,
      bookingsCount: 1,
    });
    expect(steps.find((s) => s.id === "first-booking")?.done).toBe(true);
  });

  it("share href routes to handle when set", () => {
    const steps = computeOnboardingSteps({
      ...baseInputs,
      handle: "alex",
    });
    expect(steps.find((s) => s.id === "share")?.href).toBe("/h/alex");
  });

  it("share href routes to /profile when no handle yet", () => {
    const steps = computeOnboardingSteps(baseInputs);
    expect(steps.find((s) => s.id === "share")?.href).toBe("/profile");
  });
});

describe("onboarding — progress + completion", () => {
  it("progress returns 0/5 at first paint", () => {
    const steps = computeOnboardingSteps(baseInputs);
    const p = progress(steps);
    expect(p).toEqual({ done: 0, total: 5, percent: 0 });
  });

  it("progress returns 5/5 when everything done", () => {
    const steps = computeOnboardingSteps({
      handle: "alex",
      timezone: "America/New_York",
      availabilityCount: 1,
      bookingsCount: 1,
      manuallyDone: new Set(["share"]),
    });
    expect(progress(steps)).toEqual({ done: 5, total: 5, percent: 100 });
    expect(isComplete(steps)).toBe(true);
  });

  it("isComplete returns false when even one step pending", () => {
    const steps = computeOnboardingSteps({
      handle: "alex",
      timezone: "America/New_York",
      availabilityCount: 1,
      bookingsCount: 0,
      manuallyDone: new Set(["share"]),
    });
    expect(isComplete(steps)).toBe(false);
  });
});
