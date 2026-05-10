"use client";

import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type MouseEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

type TransitionPhase = "idle" | "exiting" | "navigating" | "entering";

type PendingNavigation = {
  href: string;
  replace: boolean;
};

type TransitionState =
  | {
      phase: Exclude<TransitionPhase, "navigating">;
    }
  | {
      phase: "navigating";
      fromPathname: string | null;
    };

type DashboardRouteTransitionContextValue = {
  phase: TransitionPhase;
  beginNavigation: (href: string, options?: { replace?: boolean }) => boolean;
  commitNavigation: () => void;
  finishEnter: () => void;
};

const DashboardRouteTransitionContext =
  createContext<DashboardRouteTransitionContextValue | null>(null);

export function DashboardRouteTransitionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [transition, setTransition] = useState<TransitionState>({
    phase: "idle",
  });
  const pendingRef = useRef<PendingNavigation | null>(null);
  const visualPhase =
    transition.phase === "navigating" &&
    pathname !== transition.fromPathname
      ? "entering"
      : transition.phase;

  const beginNavigation = useCallback(
    (href: string, options?: { replace?: boolean }) => {
      if (
        transition.phase === "exiting" ||
        transition.phase === "navigating"
      ) {
        return true;
      }

      const target = new URL(href, window.location.href);
      if (target.origin !== window.location.origin) {
        return false;
      }

      const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      const targetPath = `${target.pathname}${target.search}${target.hash}`;
      if (
        targetPath === currentPath ||
        (target.pathname === "/settings" &&
          window.location.pathname.startsWith("/settings"))
      ) {
        return false;
      }

      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        if (options?.replace) {
          router.replace(href);
        } else {
          router.push(href);
        }
        return true;
      }

      pendingRef.current = {
        href,
        replace: options?.replace ?? false,
      };
      setTransition({ phase: "exiting" });
      return true;
    },
    [router, transition.phase],
  );

  const commitNavigation = useCallback(() => {
    const pending = pendingRef.current;
    if (!pending) {
      setTransition({ phase: "idle" });
      return;
    }

    setTransition({ phase: "navigating", fromPathname: pathname });
    if (pending.replace) {
      router.replace(pending.href);
    } else {
      router.push(pending.href);
    }
  }, [pathname, router]);

  const finishEnter = useCallback(() => {
    if (
      transition.phase === "entering" ||
      transition.phase === "navigating"
    ) {
      pendingRef.current = null;
      setTransition({ phase: "idle" });
    }
  }, [transition.phase]);

  const value = useMemo(
    () => ({
      phase: visualPhase,
      beginNavigation,
      commitNavigation,
      finishEnter,
    }),
    [beginNavigation, commitNavigation, finishEnter, visualPhase],
  );

  return (
    <DashboardRouteTransitionContext.Provider value={value}>
      {children}
    </DashboardRouteTransitionContext.Provider>
  );
}

export function useDashboardRouteTransition() {
  const context = useContext(DashboardRouteTransitionContext);
  if (!context) {
    throw new Error(
      "useDashboardRouteTransition must be used inside DashboardRouteTransitionProvider",
    );
  }
  return context;
}

type DashboardTransitionLinkProps = Omit<
  ComponentProps<typeof Link>,
  "href"
> & {
  href: string;
};

function isPlainLeftClick(event: MouseEvent<HTMLAnchorElement>) {
  return (
    event.button === 0 &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey
  );
}

export const DashboardTransitionLink = forwardRef<
  HTMLAnchorElement,
  DashboardTransitionLinkProps
>(function DashboardTransitionLink(
  { href, onClick, replace, target, download, prefetch, ...props },
  ref,
) {
  const { beginNavigation } = useDashboardRouteTransition();

  const handleClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      onClick?.(event);
      if (
        event.defaultPrevented ||
        !isPlainLeftClick(event) ||
        (target != null && target !== "_self") ||
        download
      ) {
        return;
      }

      if (beginNavigation(href, { replace })) {
        event.preventDefault();
      }
    },
    [beginNavigation, download, href, onClick, replace, target],
  );

  const prefetchProp = prefetch ?? true;

  return (
    <Link
      ref={ref}
      href={href}
      onClick={handleClick}
      replace={replace}
      target={target}
      download={download}
      prefetch={prefetchProp}
      {...props}
    />
  );
});
