"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CheckIcon, ChevronRightIcon, XIcon } from "lucide-react";
import { Popover } from "@base-ui/react/popover";
import { trpc } from "@/trpc/hooks";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  computeOnboardingSteps,
  isComplete,
  progress,
  type OnboardingStepId,
} from "@/lib/onboarding";

// Compact onboarding affordance — small pill with a progress dot
// strip + label that opens a popover with the full checklist.
// Replaces the prior full-card surface that ate ~200px above the
// bookings list. Pill is ~28px tall; popover anchors below on
// click.
//
// Pill render:
//   ●●○  2 of 3 setup steps  ›
//
// Popover:
//   Header — "Get started" eyebrow + percent done + close X
//   Step list — same shape as the prior card; checked items
//   strikethrough'd, pending items show "Open ›" + (manual)
//   "Mark done" inline buttons
//
// State source unchanged (B.PT43): User row owns
// `onboardingDismissed` + `onboardingManualSteps`. SSR-hydrated
// via `users.me`. Once dismissed OR every step complete, the
// pill disappears.

export function OnboardingChecklist() {
  const t = useTranslations("Onboarding");
  const utils = trpc.useUtils();
  const me = trpc.users.me.useQuery();
  const ranges = trpc.schedule.get.useQuery();
  const bookings = trpc.bookings.listForHost.useQuery();
  const [open, setOpen] = useState(false);

  const setOnboardingState = trpc.users.setOnboardingState.useMutation({
    onMutate: async (input) => {
      await utils.users.me.cancel();
      const prev = utils.users.me.getData();
      if (prev) {
        utils.users.me.setData(undefined, {
          ...prev,
          onboardingDismissed:
            input.dismissed !== undefined
              ? input.dismissed
              : prev.onboardingDismissed,
          onboardingManualSteps:
            input.manualSteps !== undefined
              ? input.manualSteps
              : prev.onboardingManualSteps,
        });
      }
      return { prev };
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.prev) utils.users.me.setData(undefined, ctx.prev);
    },
  });

  const manuallyDone = useMemo<ReadonlySet<OnboardingStepId>>(
    () => new Set(me.data?.onboardingManualSteps ?? []),
    [me.data?.onboardingManualSteps],
  );

  const steps = useMemo(() => {
    return computeOnboardingSteps({
      handle: me.data?.handle ?? null,
      timezone: me.data?.timezone ?? "UTC",
      availabilityCount: ranges.data?.length ?? 0,
      bookingsCount:
        (bookings.data?.upcoming.length ?? 0) +
        (bookings.data?.past.length ?? 0),
      manuallyDone,
    });
  }, [me.data, ranges.data, bookings.data, manuallyDone]);

  if (!me.data) return null;
  if (me.data.onboardingDismissed) return null;
  if (isComplete(steps)) return null;

  const { done, total, percent } = progress(steps);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        className="oh-focus-ring inline-flex items-center gap-2.5 self-start rounded-(--oh-r-sm) bg-[var(--oh-paper)] px-3 py-1.5 shadow-[var(--oh-shadow-resting)] transition-shadow duration-150 ease-oh hover:shadow-[var(--oh-shadow-hover)] data-[popup-open]:shadow-[var(--oh-shadow-hover)]"
        aria-label={t("sectionAria")}
      >
        {/* Progress dot strip — one dot per step. Filled dots for
            completed steps, empty rings for pending. Reads as a
            mini progress bar at chrome scale. */}
        <span aria-hidden className="flex items-center gap-1">
          {steps.map((step, i) => (
            <span
              key={i}
              className={cn(
                "size-1.5 rounded-full",
                step.done
                  ? "bg-[var(--oh-ink)]"
                  : "border border-[var(--oh-line)]",
              )}
            />
          ))}
        </span>
        <span className="oh-eyebrow opacity-100">
          {t("gettingStarted", { done, total })}
        </span>
        <ChevronRightIcon
          className="size-3 opacity-55 transition-transform duration-150 ease-oh data-[popup-open]:rotate-90"
          strokeWidth={2}
          aria-hidden
        />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={8} align="start">
          <Popover.Popup className="oh-onboarding-popup">
            <header className="flex items-start justify-between gap-4 px-4 pt-4">
              <div className="min-w-0">
                <p className="oh-eyebrow">
                  {t("gettingStarted", { done, total })}
                </p>
                <h2 className="mt-2 text-[18px] font-black leading-tight">
                  {t("percentSetUp", { percent })}
                </h2>
              </div>
              <Popover.Close
                render={
                  <Button
                    type="button"
                    variant="ohGhost"
                    size="icon-sm"
                    onClick={() =>
                      setOnboardingState.mutate({ dismissed: true })
                    }
                    aria-label={t("hideAria")}
                  >
                    <XIcon strokeWidth={1.5} />
                  </Button>
                }
              />
            </header>
            <ul role="list" className="flex flex-col gap-3 px-4 pb-4 pt-4">
              {steps.map((step) => (
                <li key={step.id}>
                  <StepRow
                    step={step}
                    onMark={() => {
                      const next = new Set(manuallyDone);
                      next.add(step.id);
                      setOnboardingState.mutate({
                        manualSteps: Array.from(next),
                      });
                    }}
                  />
                </li>
              ))}
            </ul>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

function StepRow({
  step,
  onMark,
}: {
  step: ReturnType<typeof computeOnboardingSteps>[number];
  onMark: () => void;
}) {
  const t = useTranslations("Onboarding");
  return (
    <div className="flex items-start gap-3">
      {/* Circular check indicator. Filled with ink when done,
          empty hairline ring when pending. Tighter than the prior
          lucide circle icons — matches the dot strip on the pill. */}
      <span
        aria-hidden
        className={cn(
          "mt-1 inline-flex size-3.5 shrink-0 items-center justify-center rounded-full",
          step.done
            ? "bg-[var(--oh-ink)] text-[var(--oh-paper)]"
            : "border border-[var(--oh-line)]",
        )}
      >
        {step.done ? (
          <CheckIcon className="size-2.5" strokeWidth={3} />
        ) : null}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p
            className={cn(
              "text-[13px] font-bold",
              step.done ? "line-through opacity-55" : "opacity-100",
            )}
          >
            {t(step.titleKey)}
          </p>
          {!step.done ? (
            <Link
              href={step.href}
              className="oh-eyebrow underline underline-offset-4 opacity-65 hover:opacity-100"
            >
              {t("openLink")}
            </Link>
          ) : null}
        </div>
        <p
          className={cn(
            "mt-1 text-[12px] leading-[1.4]",
            step.done ? "opacity-40" : "opacity-65",
          )}
        >
          {t(step.descriptionKey)}
        </p>
        {!step.done && step.manual ? (
          <Button
            type="button"
            variant="ohGhost"
            size="oh"
            onClick={onMark}
            className="mt-2"
          >
            {t("markDone")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
