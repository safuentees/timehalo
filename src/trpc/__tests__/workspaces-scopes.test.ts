import { describe, it, expect } from "vitest";
import { hasScope, scopesFor, WORKSPACE_SCOPES } from "@/lib/workspaces";

describe("workspace scope matrix", () => {
  it("OWNER grants every scope", () => {
    for (const scope of WORKSPACE_SCOPES) {
      expect(hasScope("OWNER", scope)).toBe(true);
    }
  });

  it("ADMIN grants writes except workspace.write", () => {
    expect(hasScope("ADMIN", "members.write")).toBe(true);
    expect(hasScope("ADMIN", "bookings.write")).toBe(true);
    expect(hasScope("ADMIN", "webhooks.write")).toBe(true);
    expect(hasScope("ADMIN", "workspace.write")).toBe(false);
  });

  it("MEMBER grants reads + bookings.write only", () => {
    expect(hasScope("MEMBER", "bookings.write")).toBe(true);
    expect(hasScope("MEMBER", "bookings.read")).toBe(true);
    expect(hasScope("MEMBER", "members.write")).toBe(false);
    expect(hasScope("MEMBER", "webhooks.write")).toBe(false);
  });

  it("VIEWER grants no writes", () => {
    expect(hasScope("VIEWER", "bookings.read")).toBe(true);
    expect(hasScope("VIEWER", "bookings.write")).toBe(false);
    expect(hasScope("VIEWER", "members.write")).toBe(false);
    expect(hasScope("VIEWER", "workspace.write")).toBe(false);
  });

  it("scopesFor returns the same set hasScope reports", () => {
    for (const role of ["OWNER", "ADMIN", "MEMBER", "VIEWER"] as const) {
      const list = scopesFor(role);
      for (const scope of list) {
        expect(hasScope(role, scope)).toBe(true);
      }
    }
  });
});
