import { describe, it, expect } from "vitest";
import { nextHrefAfterWorkspaceSwitch } from "@/lib/active-workspace";

describe("nextHrefAfterWorkspaceSwitch", () => {
  it("returns null when oldSlug === newSlug (no-op switch)", () => {
    expect(
      nextHrefAfterWorkspaceSwitch("/bookings", "alpha", "alpha"),
    ).toBeNull();
    expect(
      nextHrefAfterWorkspaceSwitch(
        "/workspaces/alpha/members",
        "alpha",
        "alpha",
      ),
    ).toBeNull();
  });

  it("stays on noun-based dashboard pages (/bookings, /availability, /settings, /profile)", () => {
    expect(
      nextHrefAfterWorkspaceSwitch("/bookings", "alpha", "beta"),
    ).toBeNull();
    expect(
      nextHrefAfterWorkspaceSwitch("/availability", "alpha", "beta"),
    ).toBeNull();
    expect(
      nextHrefAfterWorkspaceSwitch("/settings", "alpha", "beta"),
    ).toBeNull();
    expect(
      nextHrefAfterWorkspaceSwitch("/profile", "alpha", "beta"),
    ).toBeNull();
  });

  it("stays on /bookings/[publicUid] deep id routes", () => {
    expect(
      nextHrefAfterWorkspaceSwitch(
        "/bookings/abc-123-uid",
        "alpha",
        "beta",
      ),
    ).toBeNull();
  });

  it("stays on the public visitor surface (defensive — switcher isn't visible there)", () => {
    expect(
      nextHrefAfterWorkspaceSwitch("/h/some-handle", "alpha", "beta"),
    ).toBeNull();
    expect(
      nextHrefAfterWorkspaceSwitch(
        "/h/some-handle/booked/uid",
        "alpha",
        "beta",
      ),
    ).toBeNull();
  });

  it("rewrites /workspaces/<oldSlug> root", () => {
    expect(
      nextHrefAfterWorkspaceSwitch("/workspaces/alpha", "alpha", "beta"),
    ).toBe("/workspaces/beta");
  });

  it("rewrites /workspaces/<oldSlug>/<segment> in place", () => {
    expect(
      nextHrefAfterWorkspaceSwitch(
        "/workspaces/alpha/members",
        "alpha",
        "beta",
      ),
    ).toBe("/workspaces/beta/members");
    expect(
      nextHrefAfterWorkspaceSwitch(
        "/workspaces/alpha/event-types",
        "alpha",
        "beta",
      ),
    ).toBe("/workspaces/beta/event-types");
    expect(
      nextHrefAfterWorkspaceSwitch(
        "/workspaces/alpha/settings",
        "alpha",
        "beta",
      ),
    ).toBe("/workspaces/beta/settings");
  });

  it("rewrites nested workspace sub-segments (/workspaces/<slug>/event-types/[id]/edit)", () => {
    expect(
      nextHrefAfterWorkspaceSwitch(
        "/workspaces/alpha/event-types/intro/edit",
        "alpha",
        "beta",
      ),
    ).toBe("/workspaces/beta/event-types/intro/edit");
  });

  it("does NOT rewrite /workspaces (the workspaces hub list)", () => {
    expect(
      nextHrefAfterWorkspaceSwitch("/workspaces", "alpha", "beta"),
    ).toBeNull();
  });

  it("does NOT rewrite when the slug appears mid-segment (substring guard)", () => {
    expect(
      nextHrefAfterWorkspaceSwitch(
        "/workspaces/alphafoo/members",
        "alpha",
        "beta",
      ),
    ).toBeNull();
  });

  it("handles slugs containing hyphens / digits cleanly", () => {
    expect(
      nextHrefAfterWorkspaceSwitch(
        "/workspaces/team-2025/settings",
        "team-2025",
        "team-2026",
      ),
    ).toBe("/workspaces/team-2026/settings");
  });

  it("returns null on empty pathname (defensive against initial render)", () => {
    expect(nextHrefAfterWorkspaceSwitch("", "alpha", "beta")).toBeNull();
  });
});
