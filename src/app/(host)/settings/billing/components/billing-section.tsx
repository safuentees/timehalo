"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { trpc } from "@/trpc/hooks";
import { OhPageHeader } from "@/components/oh/page-header";
import { OhPageShell } from "@/components/oh/page-shell";
import { BillingFields } from "../../components/billing-fields";

function CheckoutReturnSync() {
  const t = useTranslations("Billing");
  const router = useRouter();
  const searchParams = useSearchParams();
  const utils = trpc.useUtils();

  const status = searchParams.get("billing");

  const sessionStartedRef = useRef(false);
  useEffect(() => {
    if (status === "success") {
      sessionStartedRef.current = false;
    }
  }, [status]);

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

      await Promise.all([
        utils.billing.currentPlan.invalidate(),
        utils.workspaces.list.invalidate(),
      ]);

      const slug =
        utils.workspaces.list
          .getData()
          ?.find((w) => w.isActive)?.slug ??
        utils.workspaces.list.getData()?.[0]?.slug ??
        null;
      if (!slug) {
        return;
      }
      const plan = utils.billing.currentPlan.getData({ slug })?.plan;

      if (plan && plan !== "FREE") {
        toast.success(t("checkoutSuccessToast"));
        router.replace("/settings/billing", { scroll: false });
        return;
      }

      if (Date.now() - startedAt >= POLL_BUDGET_MS) {
        toast.info(t("checkoutPendingToast"));
        router.replace("/settings/billing", { scroll: false });
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
