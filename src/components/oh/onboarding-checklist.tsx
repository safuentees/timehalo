"use client";

import { useMemo } from "react";
import Link from "next/link";
import { CheckCircleIcon, CircleIcon, XIcon } from "lucide-react";
import { trpc } from "@/trpc/hooks";
import { Button } from "@/components/ui/button";
import {
  computeOnboardingSteps,
  isComplete,
  progress,
  type OnboardingStepId,
} from "@/lib/onboarding";

export function OnboardingChecklist() {
  const utils = trpc.useUtils();
  const me = trpc.users.me.useQuery();
  const ranges = trpc.schedule.get.useQuery();
  const bookings = trpc.bookings.listForHost.useQuery();

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
    <section
      className="mt-6 border-2 border-oh-line-strong p-5"
      aria-label="Getting started checklist"
    >
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="oh-eyebrow">
            Getting started ({done}/{total})
          </p>
          <h2 className="mt-2 text-[18px] font-black leading-tight">
            {percent}% set up
          </h2>
        </div>
        <button
          type="button"
          onClick={() => setOnboardingState.mutate({ dismissed: true })}
          aria-label="Hide checklist"
          className="opacity-55 hover:opacity-100 transition-opacity"
        >
          <XIcon className="size-4" />
        </button>
      </header>

      <ul role="list" className="mt-5 flex flex-col gap-3">
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
    </section>
  );
}

function StepRow({
  step,
  onMark,
}: {
  step: ReturnType<typeof computeOnboardingSteps>[number];
  onMark: () => void;
}) {
  const Icon = step.done ? CheckCircleIcon : CircleIcon;
  return (
    <div className="flex items-start gap-3">
      <Icon
        className={[
          "mt-0.5 size-4 flex-shrink-0",
          step.done ? "opacity-90" : "opacity-40",
        ].join(" ")}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p
            className={[
              "text-[14px] font-bold",
              step.done ? "line-through opacity-55" : "opacity-100",
            ].join(" ")}
          >
            {step.title}
          </p>
          {!step.done ? (
            <Link
              href={step.href}
              className="font-[family-name:var(--oh-mono)] text-[10px] font-extrabold tracking-[2px] uppercase underline underline-offset-4 opacity-65 hover:opacity-100"
            >
              Open →
            </Link>
          ) : null}
        </div>
        <p
          className={[
            "mt-1 text-[12px] leading-[1.4]",
            step.done ? "opacity-40" : "opacity-65",
          ].join(" ")}
        >
          {step.description}
        </p>
        {!step.done && step.manual ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onMark}
            className="mt-2 h-auto py-1 text-[11px]"
          >
            Mark done
          </Button>
        ) : null}
      </div>
    </div>
  );
}
