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

// Onboarding checklist surface — renders above the bookings list on
// /bookings until either the host clicks "Hide" or every step is
// complete. Five steps; tasks the host has already done show
// auto-checked, tasks pending show as links.
//
// State source (B.PT43): the User row owns `onboardingDismissed` +
// `onboardingManualSteps`. The previous localStorage shape
// (`officehours.onboarding.{hide,manual}`) couldn't be read during
// SSR — so the checklist server-rendered with `manuallyDone:
// new Set()`, the "Share your link" step rendered unchecked, and
// the post-hydration client read snap-flipped it to checked. Moving
// to the DB lets `users.me`'s SSR prefetch carry the truth on first
// paint. dub stores onboarding-completion on Workspace; cal.com
// stores it on User. We follow cal.com — onboarding is a per-host
// concern, not per-workspace.
//
// Pattern reference: dub /apps/web/ui/layout/toolbar/onboarding/
// onboarding-button.tsx — same shape (progress fraction +
// title/desc/CTA per task), DB-backed.

export function OnboardingChecklist() {
  const utils = trpc.useUtils();
  const me = trpc.users.me.useQuery();
  const ranges = trpc.schedule.get.useQuery();
  const bookings = trpc.bookings.listForHost.useQuery();

  // Optimistic dismiss + mark-done. Without `setData` here the card
  // would linger ~50-300ms while the mutation round-trips, defeating
  // the "click Hide → it's gone" expectation. Hooks.ts's global
  // useMutation override invalidates every query on success, so the
  // server-confirmed value lands automatically on the next refetch
  // — we only need the optimistic write + onError rollback.
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

  // SSR + first-render guard. `me.data` is hydrated by the layout's
  // prefetch (B.PT41) so this should be truthy on first paint of every
  // host route — but we still keep the guard for the rare cases where
  // the cache hasn't landed (background refetches, route-level cache
  // misses on stale pages).
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
        <Button
          type="button"
          variant="ohGhost"
          size="icon-sm"
          onClick={() => setOnboardingState.mutate({ dismissed: true })}
          aria-label="Hide checklist"
        >
          <XIcon strokeWidth={1.5} />
        </Button>
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
            variant="ohGhost"
            size="oh"
            onClick={onMark}
            className="mt-2"
          >
            Mark done
          </Button>
        ) : null}
      </div>
    </div>
  );
}
