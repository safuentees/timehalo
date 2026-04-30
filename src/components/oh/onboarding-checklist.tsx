"use client";

import {
  useCallback,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
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

const HIDE_KEY = "officehours.onboarding.hide";
const MANUAL_KEY = "officehours.onboarding.manual";

export function OnboardingChecklist() {
  const me = trpc.users.me.useQuery();
  const ranges = trpc.schedule.get.useQuery();
  const bookings = trpc.bookings.listForHost.useQuery();

  const [hidden, setHidden] = useLocalStorageBool(HIDE_KEY, false);
  const [manuallyDone, setManuallyDone] = useLocalStorageStringSet(
    MANUAL_KEY,
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

  if (hidden) return null;

  if (!me.data) return null;

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
          onClick={() => setHidden(true)}
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
                setManuallyDone((prev) => {
                  const next = new Set(prev);
                  next.add(step.id);
                  return next;
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

function subscribeToKey(key: string) {
  return (notify: () => void) => {
    const handler = (e: Event) => {
      if (e instanceof StorageEvent && e.key !== key) return;
      notify();
    };
    window.addEventListener("storage", handler);
    window.addEventListener(`oh-localstorage:${key}`, handler);
    return () => {
      window.removeEventListener("storage", handler);
      window.removeEventListener(`oh-localstorage:${key}`, handler);
    };
  };
}

function notifyKey(key: string) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(`oh-localstorage:${key}`));
  }
}

function useLocalStorageBool(key: string, initial: boolean) {
  const subscribe = useMemo(() => subscribeToKey(key), [key]);
  const value = useSyncExternalStore(
    subscribe,
    () => {
      try {
        const raw = localStorage.getItem(key);
        return raw === null ? initial : raw === "true";
      } catch {
        return initial;
      }
    },
    () => initial,
  );
  const set = useCallback(
    (next: boolean) => {
      try {
        localStorage.setItem(key, String(next));
      } catch {
      }
      notifyKey(key);
    },
    [key],
  );
  return [value, set] as const;
}

function useLocalStorageStringSet(key: string) {
  const subscribe = useMemo(() => subscribeToKey(key), [key]);
  const cacheRef = useRef<{
    raw: string | null | undefined;
    value: ReadonlySet<OnboardingStepId>;
  }>({ raw: undefined, value: EMPTY_SET });

  const getSnapshot = useCallback((): ReadonlySet<OnboardingStepId> => {
    try {
      const raw = localStorage.getItem(key);
      if (raw === cacheRef.current.raw) return cacheRef.current.value;
      if (raw === null) {
        cacheRef.current = { raw: null, value: EMPTY_SET };
        return EMPTY_SET;
      }
      const parsed = JSON.parse(raw);
      const next: ReadonlySet<OnboardingStepId> = Array.isArray(parsed)
        ? (new Set(parsed.filter(isStepId)) as ReadonlySet<OnboardingStepId>)
        : EMPTY_SET;
      cacheRef.current = { raw, value: next };
      return next;
    } catch {
      return EMPTY_SET;
    }
  }, [key]);

  const value = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_SET);
  const set = useCallback(
    (
      updater: (
        prev: ReadonlySet<OnboardingStepId>,
      ) => ReadonlySet<OnboardingStepId>,
    ) => {
      let prev: ReadonlySet<OnboardingStepId> = EMPTY_SET;
      try {
        const raw = localStorage.getItem(key);
        if (raw !== null) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            prev = new Set(parsed.filter(isStepId));
          }
        }
      } catch {
      }
      const next = updater(prev);
      try {
        localStorage.setItem(key, JSON.stringify(Array.from(next)));
      } catch {
      }
      notifyKey(key);
    },
    [key],
  );
  return [value, set] as const;
}

const EMPTY_SET: ReadonlySet<OnboardingStepId> = new Set();

function isStepId(value: unknown): value is OnboardingStepId {
  return (
    value === "handle" ||
    value === "timezone" ||
    value === "availability" ||
    value === "share" ||
    value === "first-booking"
  );
}
