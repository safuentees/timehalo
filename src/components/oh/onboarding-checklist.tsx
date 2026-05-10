"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CheckIcon, ChevronRightIcon, XIcon } from "lucide-react";
import { Popover } from "@base-ui/react/popover";
import { trpc } from "@/trpc/hooks";
import { cn } from "@/lib/utils";
import {
  computeOnboardingSteps,
  isComplete,
  progress,
  type OnboardingStepId,
} from "@/lib/onboarding";

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
      <div className="inline-flex items-center gap-0.5 self-start">
        <Popover.Trigger
          className="oh-focus-ring inline-flex items-center gap-2.5 rounded-(--oh-r-sm) bg-[var(--oh-paper)] px-3 py-1.5 shadow-[var(--oh-shadow-resting)] transition-shadow duration-150 ease-oh hover:shadow-[var(--oh-shadow-hover)] data-[popup-open]:shadow-[var(--oh-shadow-hover)]"
          aria-label={t("sectionAria")}
        >
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
        <button
          type="button"
          onClick={() => setOnboardingState.mutate({ dismissed: true })}
          aria-label={t("hideAria")}
          className="oh-focus-ring inline-flex size-7 items-center justify-center rounded-(--oh-r-xs) text-[color:var(--oh-ink)] opacity-40 transition-[opacity,background-color] duration-150 ease-oh hover:bg-[var(--oh-tint-hover)] hover:opacity-100 focus-visible:opacity-100"
        >
          <XIcon strokeWidth={1.75} className="size-3.5" aria-hidden />
        </button>
      </div>
      <Popover.Portal>
        <Popover.Positioner
          sideOffset={8}
          align="start"
          style={{ zIndex: 100 }}
          className="outline-none"
        >
          <Popover.Popup
            className="flex w-[340px] max-w-[calc(100vw-24px)] flex-col rounded-(--oh-r-sm) bg-[color:var(--oh-paper)] text-[color:var(--oh-ink)] shadow-[var(--oh-shadow-popup)] outline-none origin-top-left transition-[transform,opacity] duration-200 ease-oh [&[data-starting-style]]:opacity-0 [&[data-starting-style]]:-translate-y-1 [&[data-starting-style]]:scale-[0.96] [&[data-ending-style]]:opacity-0 [&[data-ending-style]]:-translate-y-1 [&[data-ending-style]]:scale-[0.96]"
          >
            <header className="px-4 pt-4">
              <p className="oh-eyebrow">
                {t("gettingStarted", { done, total })}
              </p>
              <h2 className="mt-2 text-[18px] font-black leading-tight">
                {t("percentSetUp", { percent })}
              </h2>
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

  let indicator: React.ReactNode;
  if (step.done) {
    indicator = (
      <span
        aria-hidden
        className="mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-[var(--oh-ink)] text-[var(--oh-paper)]"
      >
        <CheckIcon className="size-2.5" strokeWidth={3} />
      </span>
    );
  } else if (step.manual) {
    indicator = (
      <button
        type="button"
        onClick={onMark}
        aria-label={t("markDone")}
        className="oh-focus-ring group/check mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-[var(--oh-line)] transition-colors duration-150 ease-oh hover:border-[var(--oh-ink)]"
      >
        <CheckIcon
          className="size-2.5 opacity-0 transition-opacity duration-150 ease-oh group-hover/check:opacity-55 group-focus-visible/check:opacity-55"
          strokeWidth={3}
          aria-hidden
        />
      </button>
    );
  } else {
    indicator = (
      <span
        aria-hidden
        className="mt-0.5 inline-flex size-4 shrink-0 rounded-full border border-[var(--oh-line)]"
      />
    );
  }

  return (
    <div className="flex items-start gap-3">
      {indicator}
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
          {!step.done && step.href ? (
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
      </div>
    </div>
  );
}
