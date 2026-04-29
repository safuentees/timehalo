import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
  vi,
} from "vitest";
import { appRouter, createCaller } from "@/trpc/router";
import { prisma } from "@/lib/prisma";
import {
  createTestHost,
  fakeContext,
  tearDownTestHost,
} from "../../../test/fixtures";

// B3 — billing.currentPlan / startCheckout / openPortal procedure
// contracts. Stripe is mocked at the SDK level so the tests never
// hit live Stripe; the procedure-level guards (env unset →
// PRECONDITION_FAILED, no scope → FORBIDDEN, no customer → portal
// rejects) are the contracts under test.

// Stripe is lazy-imported inside the procedure module — `vi.mock`
// the SDK so every checkout/portal call short-circuits to the
// stubbed return shape. The default export must be a CONSTRUCTOR
// (the procedure does `new Stripe(...)`); `function` over arrow so
// `new` works.
const checkoutCreate = vi.fn();
const portalCreate = vi.fn();
vi.mock("stripe", () => {
  function StripeMock() {
    return {
      checkout: { sessions: { create: checkoutCreate } },
      billingPortal: { sessions: { create: portalCreate } },
    };
  }
  return { default: StripeMock };
});

vi.mock("@/env", async () => {
  const orig = await vi.importActual<typeof import("@/env")>("@/env");
  return {
    ...orig,
    env: {
      ...orig.env,
      STRIPE_SECRET_KEY: "sk_test_xxx",
      STRIPE_PRICE_PRO: "price_pro_test",
      STRIPE_PRICE_TEAM: "price_team_test",
    },
  };
});

const callRouter = createCaller(appRouter);
const HANDLE = "vitest-billing";

describe("billing procedures (B3)", () => {
  let host: { id: string; handle: string };
  let workspaceId: string;

  beforeAll(async () => {
    host = await createTestHost(HANDLE);
    const ws = await prisma.workspace.findFirstOrThrow({
      where: { ownerId: host.id },
      select: { id: true },
    });
    workspaceId = ws.id;
  });
  beforeEach(() => {
    checkoutCreate.mockReset();
    portalCreate.mockReset();
  });
  afterAll(async () => {
    await tearDownTestHost(host.id);
  });

  describe("currentPlan", () => {
    it("returns the workspace's plan + period info", async () => {
      const caller = callRouter(fakeContext({ userId: host.id }));
      const result = await caller.billing.currentPlan({ slug: HANDLE });
      // createTestHost seeds a PRO Subscription row.
      expect(result.plan).toBe("PRO");
      expect(result.status).toBe("ACTIVE");
    });

    it("throws NOT_FOUND for a non-member", async () => {
      const stranger = await createTestHost("vitest-billing-stranger");
      try {
        const strangerCaller = callRouter(
          fakeContext({ userId: stranger.id }),
        );
        await expect(
          strangerCaller.billing.currentPlan({ slug: HANDLE }),
        ).rejects.toMatchObject({ code: "NOT_FOUND" });
      } finally {
        await tearDownTestHost(stranger.id);
      }
    });
  });

  describe("startCheckout", () => {
    it("returns the Stripe-minted checkout URL", async () => {
      checkoutCreate.mockResolvedValue({
        url: "https://checkout.stripe.test/pay/cs_test_xxx",
      });
      const caller = callRouter(fakeContext({ userId: host.id }));
      const result = await caller.billing.startCheckout({
        slug: HANDLE,
        plan: "PRO",
      });
      expect(result.url).toBe("https://checkout.stripe.test/pay/cs_test_xxx");
      expect(checkoutCreate).toHaveBeenCalledTimes(1);
      const args = checkoutCreate.mock.calls[0][0];
      expect(args.mode).toBe("subscription");
      expect(args.line_items[0].price).toBe("price_pro_test");
      // workspaceId binds the session to this workspace so the
      // webhook handler knows where to upsert the Subscription row.
      expect(args.client_reference_id).toBe(workspaceId);
      expect(args.metadata.workspaceId).toBe(workspaceId);
      expect(args.metadata.plan).toBe("PRO");
    });

    it("throws INTERNAL_SERVER_ERROR when Stripe returns no URL", async () => {
      checkoutCreate.mockResolvedValue({ url: null });
      const caller = callRouter(fakeContext({ userId: host.id }));
      await expect(
        caller.billing.startCheckout({ slug: HANDLE, plan: "PRO" }),
      ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    });

    it("rejects when caller's role lacks workspace.write", async () => {
      // VIEWER role gets workspace.read but not workspace.write.
      const member = await createTestHost("vitest-billing-viewer");
      try {
        await prisma.membership.create({
          data: {
            workspaceId,
            userId: member.id,
            role: "VIEWER",
          },
        });
        const memberCaller = callRouter(fakeContext({ userId: member.id }));
        await expect(
          memberCaller.billing.startCheckout({
            slug: HANDLE,
            plan: "PRO",
          }),
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
      } finally {
        await tearDownTestHost(member.id);
      }
    });
  });

  describe("openPortal", () => {
    it("rejects when workspace has no Stripe customer yet", async () => {
      // Wipe the seeded Subscription's stripeCustomerId for this test.
      await prisma.subscription.updateMany({
        where: { workspaceId },
        data: { stripeCustomerId: null },
      });
      const caller = callRouter(fakeContext({ userId: host.id }));
      await expect(
        caller.billing.openPortal({ slug: HANDLE }),
      ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    });

    it("returns Stripe-minted portal URL when customer exists", async () => {
      await prisma.subscription.updateMany({
        where: { workspaceId },
        data: { stripeCustomerId: "cus_test_xxx" },
      });
      portalCreate.mockResolvedValue({
        url: "https://billing.stripe.test/portal/bps_xxx",
      });
      const caller = callRouter(fakeContext({ userId: host.id }));
      const result = await caller.billing.openPortal({ slug: HANDLE });
      expect(result.url).toBe(
        "https://billing.stripe.test/portal/bps_xxx",
      );
      expect(portalCreate).toHaveBeenCalledTimes(1);
      expect(portalCreate.mock.calls[0][0].customer).toBe("cus_test_xxx");
    });
  });
});
