"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { trpc } from "@/trpc/hooks";
import { OhPageHeader } from "@/components/oh/page-header";
import { OhPageShell } from "@/components/oh/page-shell";
import { BillingFields } from "../../components/billing-fields";

// Closeout sync after Stripe Checkout (B.PT80, refined B.PT89).
// Stripe's success_url returns the visitor to
// `/settings/billing?billing=success` — React Query's `currentPlan`
// is still showing the old (FREE / TEAM / PRO) plan because the
// webhook may have just fired or is about to. Without a nudge the
// user sees stale data until they reload.
//
// Pattern: dub's modal-provider triggers `mutateWorkspace()` on
// `?upgraded=true`; we do the equivalent invalidation + poll. Poll
// budget bounds the worst case (webhook processing slow but eventually
// succeeds); past budget we toast a "still processing" hint.
//
// B.PT89 — success criterion is **change**, not "non-FREE." The
// prior `plan !== "FREE"` check fired success on poll #1 for any
// downgrade-from-paid path (TEAM → PRO starts on TEAM, never goes
// through FREE, so the toast lied while the actual subscription
// state never updated). Now we snapshot the cached plan on entry
// and compare each polled value against the baseline; success only
// when it CHANGED. Falls back to the prior "non-FREE" criterion
// when no baseline is available (page hydrated cold without the
// currentPlan prefetched — unlikely for /settings/billing since
// page.tsx prefetches it, but defensive).
//
// Exposed as a sibling component so the BillingSection's render path
// stays clean and the effect's lifecycle is scoped to the billing
// route only (not all of /settings).
function CheckoutReturnSync() {
  const t = useTranslations("Billing");
  const router = useRouter();
  const searchParams = useSearchParams();
  const utils = trpc.useUtils();

  // Snapshot the search-param value once per "land on this page with
  // billing=success" — the effect cleanup re-runs when the dep array
  // changes, but we only want one polling session per arrival.
  const status = searchParams.get("billing");

  // Guard: a single sync session per status flip. Without it,
  // `router.replace` triggers a re-render → searchParams shifts →
  // status is now null → the effect cleanup tears down our timers
  // (correct), but the next time the user lands on this page with
  // ?billing=success, a stale ref tells us we already ran. Reset on
  // status === "success" entry.
  const sessionStartedRef = useRef(false);
  // B.PT89 — Pre-checkout plan baseline. Read from cache (no extra
  // fetch) on `status="success"` entry so polling can detect actual
  // change (TEAM → PRO) instead of trivial non-FREE. Cleared after
  // the polling session resolves so a subsequent visit gets a fresh
  // snapshot.
  const baselinePlanRef = useRef<string | null>(null);
  useEffect(() => {
    if (status === "success") {
      sessionStartedRef.current = false;
      const slug =
        utils.workspaces.list
          .getData()
          ?.find((w) => w.isActive)?.slug ??
        utils.workspaces.list.getData()?.[0]?.slug ??
        null;
      baselinePlanRef.current = slug
        ? (utils.billing.currentPlan.getData({ slug })?.plan ?? null)
        : null;
    }
  }, [status, utils]);

  useEffect(() => {
    if (status !== "success") return;
    if (sessionStartedRef.current) return;
    sessionStartedRef.current = true;

    const POLL_INTERVAL_MS = 2_000;
    const POLL_BUDGET_MS = 10_000;
    const startedAt = Date.now();

    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      if (!active) return;

      // Re-read every workspace's active plan + the topbar list so the
      // tier badge in the chrome and the section banner are honest in
      // the same tick.
      await Promise.all([
        utils.billing.currentPlan.invalidate(),
        utils.workspaces.list.invalidate(),
      ]);

      // Read the freshest current-plan response back out of the cache
      // to decide whether to keep polling. `getData` reads w/o
      // triggering a fetch — the invalidate above schedules the
      // refetch, this just inspects what landed.
      const slug =
        utils.workspaces.list
          .getData()
          ?.find((w) => w.isActive)?.slug ??
        utils.workspaces.list.getData()?.[0]?.slug ??
        null;
      if (!slug) {
        // No workspace yet — bail; the user is in a weird state.
        return;
      }
      const plan = utils.billing.currentPlan.getData({ slug })?.plan;

      // B.PT89 — success when the plan CHANGED from the baseline,
      // OR (defensive fallback when no baseline was captured) when
      // the plan is non-FREE. The defensive path matches the prior
      // B.PT80 behavior so a cold-cache hydration still ships a
      // toast on FREE → paid upgrades.
      const baseline = baselinePlanRef.current;
      const planChanged =
        baseline !== null
          ? plan !== undefined && plan !== baseline
          : Boolean(plan && plan !== "FREE");

      if (planChanged) {
        toast.success(t("checkoutSuccessToast"));
        router.replace("/settings/billing", { scroll: false });
        baselinePlanRef.current = null;
        return;
      }

      if (Date.now() - startedAt >= POLL_BUDGET_MS) {
        // Webhook hasn't landed within budget — surface a hint instead
        // of silently giving up. The visible state is still stale but
        // the user knows to come back / reload.
        toast.info(t("checkoutPendingToast"));
        router.replace("/settings/billing", { scroll: false });
        baselinePlanRef.current = null;
        return;
      }

      timer = setTimeout(poll, POLL_INTERVAL_MS);
    }

    void poll();

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [status, utils, router, t]);

  // Cancelled state: visitor cancelled the Stripe Checkout. No DB
  // mutation happened, but we still want to clear the URL so a reload
  // doesn't re-fire any logic and the section header reads cleanly.
  useEffect(() => {
    if (status !== "cancelled") return;
    toast.info(t("checkoutCancelledToast"));
    router.replace("/settings/billing", { scroll: false });
  }, [status, router, t]);

  return null;
}

export function BillingSection() {
  const t = useTranslations("Settings");
  return (
    <OhPageShell tight>
      <OhPageHeader title={t("subnavBilling")} />
      <CheckoutReturnSync />
      <div className="mt-8">
        <BillingFields />
      </div>
    </OhPageShell>
  );
}
