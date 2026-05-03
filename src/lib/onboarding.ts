// Pure logic for the host onboarding checklist (A6). Lives in /lib so
// it can be tested in isolation; the React component renders the
// resulting steps array. Each step has a `done` boolean derived from
// the user's actual data — no separate "completion" record needed.

import { DEFAULT_TIMEZONE } from "@/lib/timezone";

// Single source of truth for the step id set. Re-used by:
// `users.setOnboardingState` zod input (server validates step ids), the
// JSON-cell parser in `users.me`, the localStorage→DB migration step.
export const ONBOARDING_STEP_IDS = [
  "handle",
  "timezone",
  "availability",
  "share",
  "first-booking",
] as const;

export type OnboardingStepId = (typeof ONBOARDING_STEP_IDS)[number];

export type OnboardingStep = {
  id: OnboardingStepId;
  /**
   * `Onboarding` namespace key for the step title — renderer resolves
   * via `useTranslations("Onboarding")` so the surface honors the
   * user's `oh_locale` cookie. Pre-B.PT102 these were literal English
   * strings baked into the data shape, leaking onto the dashboard.
   */
  titleKey: string;
  descriptionKey: string;
  href: string;
  done: boolean;
  /**
   * Whether the step gets auto-checked from data (handle/timezone/
   * availability/first-booking) or whether the user has to mark it
   * complete themselves (share).
   */
  manual?: boolean;
};

export type OnboardingInputs = {
  handle: string | null;
  timezone: string;
  availabilityCount: number;
  bookingsCount: number;
  /** Manually-marked step IDs from localStorage. */
  manuallyDone: ReadonlySet<OnboardingStepId>;
};

export function computeOnboardingSteps(
  inputs: OnboardingInputs,
): OnboardingStep[] {
  const handleDone = Boolean(inputs.handle && inputs.handle.length > 0);
  const timezoneDone = inputs.timezone !== DEFAULT_TIMEZONE;
  const availabilityDone = inputs.availabilityCount > 0;
  const shareDone = inputs.manuallyDone.has("share");
  const firstBookingDone = inputs.bookingsCount > 0;

  return [
    {
      id: "handle",
      titleKey: "stepHandleTitle",
      descriptionKey: "stepHandleDescription",
      href: "/profile",
      done: handleDone,
    },
    {
      id: "timezone",
      titleKey: "stepTimezoneTitle",
      descriptionKey: "stepTimezoneDescription",
      href: "/settings/general",
      done: timezoneDone,
    },
    {
      id: "availability",
      titleKey: "stepAvailabilityTitle",
      descriptionKey: "stepAvailabilityDescription",
      href: "/availability",
      done: availabilityDone,
    },
    {
      id: "share",
      titleKey: "stepShareTitle",
      descriptionKey: "stepShareDescription",
      href: inputs.handle ? `/h/${inputs.handle}` : "/profile",
      done: shareDone,
      manual: true,
    },
    {
      id: "first-booking",
      titleKey: "stepFirstBookingTitle",
      descriptionKey: "stepFirstBookingDescription",
      href: "/bookings",
      done: firstBookingDone,
    },
  ];
}

export function progress(steps: OnboardingStep[]): {
  done: number;
  total: number;
  percent: number;
} {
  const done = steps.filter((s) => s.done).length;
  const total = steps.length;
  return {
    done,
    total,
    percent: total === 0 ? 0 : Math.round((done / total) * 100),
  };
}

export function isComplete(steps: OnboardingStep[]): boolean {
  return steps.every((s) => s.done);
}
