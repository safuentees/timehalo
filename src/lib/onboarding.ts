
import { DEFAULT_TIMEZONE } from "@/lib/timezone";

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
  titleKey: string;
  descriptionKey: string;
  href?: string;
  done: boolean;
  manual?: boolean;
};

export type OnboardingInputs = {
  handle: string | null;
  timezone: string;
  availabilityCount: number;
  bookingsCount: number;
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
