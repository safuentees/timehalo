"use client";

import { useState } from "react";
import { useTranslations, useFormatter } from "next-intl";
import { trpc } from "@/trpc/hooks";
import { useBillingCheckout } from "@/lib/mutations/use-billing-checkout";
import { useBillingPortal } from "@/lib/mutations/use-billing-portal";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/oh/section-header";
import { OhInlineEmpty } from "@/components/oh/inline-empty";
import { OhSelect } from "@/components/oh/oh-select";

// Workspace billing section (B3-UI). Closes the surface gap left by
// `e76402d` — backend procedures shipped, this is the operator-facing
// React layer.
//
// Surface:
//   1. Workspace picker (only when host has multiple workspaces — same
//      branch as ApiKeysFields).
//   2. Current-plan banner: tier name (mono caps), price, renewal /
//      cancellation hint, primary CTA (Upgrade or Manage billing).
//   3. Plan list: vertical card stack on mobile, two-column at sm+ for
//      the upgradeable tiers. Each card carries its eyebrow tier name,
//      price, feature bullets, and a Switch CTA. The current tier
//      shows "Current plan" disabled instead.
//
// UX reference: dub.co `apps/web/app/.../settings/billing/plan-usage.tsx`
// (overview card) + `.../upgrade/page-client.tsx` (plan grid). Adapted
// to the brutalist palette: rounded-(--oh-r-sm), 1.5px borders,
// mono-caps eyebrows, no shadcn Card wrapper. Pricing copy via
// next-intl, no hardcoded English.

type Workspace = { slug: string; name: string; isActive: boolean };
type PlanTier = "FREE" | "PRO" | "TEAM";

const UPGRADE_TIERS = ["PRO", "TEAM"] as const;

// Display prices match what the operator wired in Stripe (sandbox PRO
// = $19.99, TEAM = $49.99). The numbers here are display-only —
// authoritative pricing always comes from Stripe at checkout, the
// procedure resolves the price by env var. We keep these inline so the
// settings UI can render the cards without a round-trip just to learn
// numbers Stripe already echoes back inside Checkout.
const PLAN_DISPLAY: Record<
  PlanTier,
  { priceCents: number; featureKeys: ReadonlyArray<string> }
> = {
  FREE: {
    priceCents: 0,
    featureKeys: ["bookings", "calendar", "membersUpTo1"],
  },
  PRO: {
    priceCents: 1999,
    featureKeys: [
      "bookings",
      "calendar",
      "membersUpTo5",
      "webhooks",
      "apiKeys",
      "workflows",
    ],
  },
  TEAM: {
    priceCents: 4999,
    featureKeys: [
      "bookings",
      "calendar",
      "membersUpTo25",
      "webhooks",
      "apiKeys",
      "workflows",
      "roundRobin",
      "prioritySupport",
    ],
  },
};

export function BillingFields() {
  const t = useTranslations("Billing");
  const { data: workspaces, isLoading: workspacesLoading } =
    trpc.workspaces.list.useQuery();

  const [pickedSlug, setPickedSlug] = useState<string | null>(null);

  // B.PT17 — same reset-on-active-change pattern as ApiKeysFields
  // (see that file for the rationale + React 19 setState-during-
  // render reasoning). Keeps the billing card honest with the
  // topbar switcher.
  const activeSlug =
    workspaces?.find((w) => w.isActive)?.slug ??
    workspaces?.[0]?.slug ??
    null;
  const [prevActiveSlug, setPrevActiveSlug] = useState<string | null>(
    activeSlug,
  );
  if (activeSlug !== prevActiveSlug) {
    setPrevActiveSlug(activeSlug);
    setPickedSlug(null);
  }

  return (
    <section aria-labelledby="billing-legend">
      <SectionHeader
        legendId="billing-legend"
        legend={t("legend")}
        description={t("description")}
      />

      {workspacesLoading ? (
        <p className="mt-5 text-[13px] opacity-55">{t("loading")}</p>
      ) : !workspaces || workspaces.length === 0 ? (
        <OhInlineEmpty className="mt-5">
          {t("noWorkspaceEmpty")}
        </OhInlineEmpty>
      ) : (
        <BillingForWorkspace
          workspaces={workspaces}
          slug={
            pickedSlug && workspaces.some((w) => w.slug === pickedSlug)
              ? pickedSlug
              : (activeSlug ?? workspaces[0].slug)
          }
          onSlugChange={setPickedSlug}
        />
      )}
    </section>
  );
}

function BillingForWorkspace({
  workspaces,
  slug,
  onSlugChange,
}: {
  workspaces: Workspace[];
  slug: string;
  onSlugChange: (slug: string) => void;
}) {
  const t = useTranslations("Billing");
  const { data: current, isLoading } =
    trpc.billing.currentPlan.useQuery({ slug });

  return (
    <>
      {workspaces.length > 1 ? (
        <div className="mt-5">
          <label htmlFor="billing-workspace" className="oh-legend">
            {t("workspaceLabel")}
          </label>
          <div className="mt-2">
            <OhSelect
              id="billing-workspace"
              value={slug}
              onChange={(e) => onSlugChange(e.target.value)}
              wrapperClassName="w-fit"
              className="min-w-[220px] font-[family-name:var(--oh-mono)] text-[14px]"
            >
              {workspaces.map((w) => (
                <option key={w.slug} value={w.slug}>
                  {w.name}
                </option>
              ))}
            </OhSelect>
          </div>
        </div>
      ) : null}

      <div className="mt-5">
        {isLoading || !current ? (
          <p className="text-[13px] opacity-55">{t("loading")}</p>
        ) : (
          <CurrentPlanBanner
            slug={slug}
            plan={current.plan}
            currentPeriodEnd={
              current.currentPeriodEnd
                ? new Date(current.currentPeriodEnd)
                : null
            }
            cancelAtPeriodEnd={current.cancelAtPeriodEnd}
            hasStripeCustomer={current.hasStripeCustomer}
          />
        )}
      </div>

      <ul role="list" className="mt-6 grid gap-2.5 sm:grid-cols-2">
        {UPGRADE_TIERS.map((tier) => (
          <li key={tier}>
            <PlanCard
              slug={slug}
              tier={tier}
              isCurrent={current?.plan === tier}
              disabled={isLoading || !current}
            />
          </li>
        ))}
      </ul>
    </>
  );
}

function CurrentPlanBanner({
  slug,
  plan,
  currentPeriodEnd,
  cancelAtPeriodEnd,
  hasStripeCustomer,
}: {
  slug: string;
  plan: PlanTier;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  hasStripeCustomer: boolean;
}) {
  const t = useTranslations("Billing");
  const fmt = useFormatter();
  const checkout = useBillingCheckout();
  const portal = useBillingPortal();
  const isFree = plan === "FREE";

  const dateLabel =
    currentPeriodEnd && !isFree
      ? cancelAtPeriodEnd
        ? t("cancelsOn", {
            date: fmt.dateTime(currentPeriodEnd, {
              year: "numeric",
              month: "short",
              day: "numeric",
            }),
          })
        : t("renewsOn", {
            date: fmt.dateTime(currentPeriodEnd, {
              year: "numeric",
              month: "short",
              day: "numeric",
            }),
          })
      : null;

  return (
    <article className="rounded-(--oh-r-sm) border-[1.5px] border-oh-line bg-oh-bg p-5 transition-colors duration-150 ease-oh hover:border-oh-line-strong sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0 flex-1">
          <p className="oh-eyebrow">{t("currentPlanLabel")}</p>
          <h3 className="mt-2 font-[family-name:var(--oh-mono)] text-[28px] font-black uppercase leading-none tracking-[1px]">
            {t(`tier.${plan}`)}
          </h3>
          <p className="oh-description mt-2">
            {isFree
              ? t("freeBlurb")
              : t("priceMonth", {
                  price: formatPrice(PLAN_DISPLAY[plan].priceCents),
                })}
            {dateLabel ? (
              <>
                <span className="ml-1 opacity-55">{dateLabel}</span>
              </>
            ) : null}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {isFree ? (
            <Button
              type="button"
              variant="oh"
              size="oh"
              disabled={checkout.isPending}
              onClick={() =>
                checkout.mutate({ slug, plan: "PRO" })
              }
            >
              {checkout.isPending ? t("redirecting") : t("upgradeToPro")}
            </Button>
          ) : (
            hasStripeCustomer && (
              <Button
                type="button"
                variant="ohGhost"
                size="oh"
                disabled={portal.isPending}
                onClick={() => portal.mutate({ slug })}
              >
                {portal.isPending ? t("redirecting") : t("manageBilling")}
              </Button>
            )
          )}
        </div>
      </div>
    </article>
  );
}

function PlanCard({
  slug,
  tier,
  isCurrent,
  disabled,
}: {
  slug: string;
  tier: "PRO" | "TEAM";
  isCurrent: boolean;
  disabled: boolean;
}) {
  const t = useTranslations("Billing");
  const checkout = useBillingCheckout();
  const display = PLAN_DISPLAY[tier];
  const featureLabels = display.featureKeys.map((k) => t(`feature.${k}`));

  return (
    <article
      className={[
        "flex h-full flex-col rounded-(--oh-r-sm) border-[1.5px] border-oh-line bg-oh-bg p-5 transition-colors duration-150 ease-oh sm:p-6",
        isCurrent
          ? "border-oh-line-strong"
          : "hover:border-oh-line-strong",
      ].join(" ")}
    >
      <header>
        <p className="oh-eyebrow">{t(`tier.${tier}`)}</p>
        <p className="mt-3 flex items-baseline gap-1">
          <span className="font-[family-name:var(--oh-mono)] text-[28px] font-black tabular-nums leading-none">
            {formatPrice(display.priceCents)}
          </span>
          <span className="oh-eyebrow opacity-55">{t("perMonth")}</span>
        </p>
      </header>

      <ul className="mt-5 flex flex-1 flex-col gap-2 text-[13px]">
        {featureLabels.map((label) => (
          <li key={label} className="flex items-start gap-2">
            <span
              aria-hidden
              className="mt-[5px] inline-block size-1.5 rounded-full bg-oh-line-strong"
            />
            <span className="opacity-80">{label}</span>
          </li>
        ))}
      </ul>

      <div className="mt-6">
        {isCurrent ? (
          <p className="oh-eyebrow opacity-55">{t("currentPlanLabel")}</p>
        ) : (
          <Button
            type="button"
            variant="oh"
            size="oh"
            disabled={disabled || checkout.isPending}
            onClick={() => checkout.mutate({ slug, plan: tier })}
            className="w-full"
          >
            {checkout.isPending
              ? t("redirecting")
              : t("upgradeTo", { tier: t(`tier.${tier}`) })}
          </Button>
        )}
      </div>
    </article>
  );
}

function formatPrice(cents: number): string {
  if (cents === 0) return "$0";
  const dollars = cents / 100;
  // Drop trailing .00 so $19 reads cleaner than $19.00; keep two
  // decimals when the price isn't an exact dollar (most paid plans
  // are .99). Display-only — Stripe is the source of truth.
  return Number.isInteger(dollars)
    ? `$${dollars}`
    : `$${dollars.toFixed(2)}`;
}
