"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { OhCard } from "@/components/oh/oh-card";
import { OhPillSwitcher } from "@/components/oh/oh-pill-switcher";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Pricing table — the page's single client island. Owns the
// monthly/annual cadence state and renders three `<OhCard>` tier
// cards. Pro uses `<OhCard active>` for the elevated-shadow chrome
// the dashboard already uses to mean "current selection" — no
// badge, no color swap.
//
// Toggle pill uses `<OhPillSwitcher>` from the dashboard's tab-bar
// vocabulary. That's the only motion on the page (Motion's
// `layoutId` slide between segments).

type Cadence = "monthly" | "annual";

type Tier = {
  label: string;
  monthly: number;
  /** Per-month price when billed annually (12 * annual ≤ 12 * monthly). */
  annual: number;
  isFree?: boolean;
  blurb: string;
  features: ReadonlyArray<string>;
  cta: { label: string; href: string };
  active?: boolean;
};

const TIERS: ReadonlyArray<Tier> = [
  {
    label: "Free",
    monthly: 0,
    annual: 0,
    isFree: true,
    blurb: "One person · up to 30 bookings a month.",
    features: [
      "Up to 30 bookings each month",
      "Single host · single workspace",
      "Email + calendar invites",
      "Custom handle (officehours.dev/you)",
      "MIT licence — fork freely",
    ],
    cta: { label: "Start free", href: "/register" },
  },
  {
    label: "Pro",
    monthly: 10,
    annual: 8,
    blurb: "Solo pros · unlimited bookings · custom branding.",
    features: [
      "Everything in Free",
      "Unlimited bookings",
      "Google Calendar 2-way sync",
      "Custom branding · your logo",
      "HMAC-signed webhooks",
      "Workflows · automated emails",
    ],
    cta: { label: "Start Pro", href: "/register?plan=pro" },
    active: true,
  },
  {
    label: "Team",
    monthly: 20,
    annual: 16,
    blurb: "Groups · round-robin · workspace audit log.",
    features: [
      "Everything in Pro",
      "Unlimited hosts",
      "Round-robin host pools",
      "Workspace-level audit log",
      "API keys + Zapier webhooks",
      "Priority email support",
    ],
    cta: { label: "Talk to sales", href: "mailto:hello@safuentes.dev" },
  },
];

function formatPrice(tier: Tier, cadence: Cadence): {
  value: string;
  period: string;
} {
  if (tier.isFree) return { value: "$0", period: "forever" };
  const amount = cadence === "annual" ? tier.annual : tier.monthly;
  return {
    value: `$${amount}`,
    period: cadence === "annual" ? "/ mo · billed annually" : "/ month",
  };
}

export function PricingTable() {
  const [cadence, setCadence] = useState<Cadence>("monthly");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-center">
        <OhPillSwitcher<Cadence>
          options={[
            { value: "monthly", label: "Monthly" },
            { value: "annual", label: "Annual — save 20%" },
          ]}
          value={cadence}
          onChange={setCadence}
          ariaLabel="Billing cadence"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {TIERS.map((tier) => {
          const { value, period } = formatPrice(tier, cadence);
          return (
            <OhCard
              key={tier.label}
              active={tier.active}
              className="flex flex-col gap-5 p-6"
            >
              <div className="flex flex-col gap-1">
                <p className="oh-eyebrow opacity-100">{tier.label}</p>
                <p className="oh-description">{tier.blurb}</p>
              </div>
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-sans text-[clamp(32px,4vw,44px)] font-black leading-none tabular-nums tracking-[-0.02em] text-oh-content">
                  {value}
                </span>
                <span className="oh-eyebrow">{period}</span>
              </div>
              <ul className="flex flex-col gap-2.5">
                {tier.features.map((feat) => (
                  <li
                    key={feat}
                    className="flex items-start gap-2 text-[14px] leading-[1.45] text-oh-content"
                  >
                    <Check
                      className="mt-0.5 size-4 shrink-0 text-oh-content-muted"
                      strokeWidth={1.5}
                    />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
              <div className={cn("mt-auto", "pt-2")}>
                <Link
                  href={tier.cta.href}
                  className={buttonVariants({
                    variant: tier.active ? "oh" : "ohGhost",
                    size: "oh",
                  })}
                >
                  {tier.cta.label}
                  <ArrowRight />
                </Link>
              </div>
            </OhCard>
          );
        })}
      </div>
    </div>
  );
}
