
import { DEFAULT_TIMEZONE } from "@/lib/timezone";

export type OnboardingStepId =
  | "handle"
  | "timezone"
  | "availability"
  | "share"
  | "first-booking";

export type OnboardingStep = {
  id: OnboardingStepId;
  title: string;
  description: string;
  href: string;
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
      title: "Pick a handle",
      description:
        "Your public URL — officehours.app/h/<handle>. Visitors book here.",
      href: "/profile",
      done: handleDone,
    },
    {
      id: "timezone",
      title: "Set your timezone",
      description:
        "Your weekly hours interpret in this zone. Default UTC works only if you live in UTC.",
      href: "/settings/general",
      done: timezoneDone,
    },
    {
      id: "availability",
      title: "Draw your weekly hours",
      description:
        "When you're available. Visitors only see slots inside these windows.",
      href: "/availability",
      done: availabilityDone,
    },
    {
      id: "share",
      title: "Share your link",
      description:
        "Post the URL where the people who'd book you actually hang out.",
      href: inputs.handle ? `/h/${inputs.handle}` : "/profile",
      done: shareDone,
      manual: true,
    },
    {
      id: "first-booking",
      title: "Get your first booking",
      description: "Auto-checks once a visitor books a slot.",
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
