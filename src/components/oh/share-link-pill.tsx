"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CheckIcon, CopyIcon, LinkIcon, XIcon } from "lucide-react";
import { trpc } from "@/trpc/hooks";
import { useMounted } from "@/hooks/use-mounted";
import { env } from "@/env";

// Local-only persistence for the share-pill dismissal — purely a UI
// preference, no server roundtrip needed. Same SSR-safe lazy-init
// pattern as `dev-notes-launcher`: the guard returns false when
// window is undefined so SSR doesn't blow up.
const SHARE_DISMISSED_STORAGE_KEY = "oh-share-link-dismissed";

function readShareDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SHARE_DISMISSED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeShareDismissed(next: boolean) {
  if (typeof window === "undefined") return;
  try {
    if (next) {
      window.localStorage.setItem(SHARE_DISMISSED_STORAGE_KEY, "1");
    } else {
      window.localStorage.removeItem(SHARE_DISMISSED_STORAGE_KEY);
    }
  } catch {
    // Quota / privacy mode — fail silently; pill stays visible.
  }
}

// Public-URL share affordance for the host's `/h/<handle>` page.
// Sits above the bookings list as a peer of the onboarding pill —
// same chrome, same hover lift — so the host always sees the URL
// they're meant to share. Click anywhere on the pill copies the URL;
// the inline copy → check icon flip is the only confirmation.
//
// The URL display strips the protocol so it reads like a real domain
// in the chrome (`officehours.app/h/handle` not the noisier
// `https://...`); the clipboard payload includes the full URL so a
// paste lands as a clickable link.
//
// Dismiss flow (B.PT-share): the share-pill ships with NO dismiss X
// at first paint — the onboarding pill already owns the "X to dismiss
// chrome" affordance, and two side-by-side X buttons read as visual
// noise. Once the host dismisses the onboarding (its X disappears)
// the share-pill grows a sibling X so the pattern stays available
// without ever showing two dismiss controls at once. Dismissal is
// persisted in localStorage (UI-only preference; no server state).
export function ShareLinkPill() {
  const t = useTranslations("Share");
  const me = trpc.users.me.useQuery();
  const mounted = useMounted();
  const [copied, setCopied] = useState(false);
  // Lazy initializer reads localStorage on first client render. SSR
  // returns false (window guard) so initial paint matches the server.
  // Visibility is gated on `mounted` below so the post-mount re-read
  // doesn't fight hydration.
  const [shareDismissed, setShareDismissed] = useState<boolean>(() =>
    readShareDismissed(),
  );

  // Build the URL on the server with the env'd base so SSR and
  // client agree on first paint. After mount, window.location.origin
  // takes over for dev environments where the env var isn't set.
  const handle = me.data?.handle;
  const base =
    env.NEXT_PUBLIC_APP_URL ??
    (mounted ? window.location.origin : "https://officehours.app");
  const fullUrl = handle ? `${base}/h/${handle}` : null;
  const displayUrl = fullUrl ? fullUrl.replace(/^https?:\/\//, "") : null;

  // Hide entirely when the user has dismissed the share pill. Gated
  // on `mounted` so the SSR pass + first client render still emit the
  // pill — matches the server snapshot and avoids hydration mismatch.
  if (mounted && shareDismissed) return null;
  if (!fullUrl || !displayUrl) return null;

  // Sibling dismiss X only surfaces AFTER the onboarding pill has
  // been hidden — until then the onboarding pill's own X carries the
  // dismiss vocabulary and a second X next to the share pill would
  // double the visual weight. Gated on `mounted` for the same
  // hydration reason as `shareDismissed`.
  const showDismissX = mounted && Boolean(me.data?.onboardingDismissed);

  async function handleCopy() {
    if (!fullUrl) return;
    try {
      await navigator.clipboard.writeText(fullUrl);
      // Inline icon swap is the only confirmation — quieter than a
      // toast and lives where the user's attention already is. The
      // copy → check flip lasts 1.4s before reverting.
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      // Silent failure — clipboard write rejections are rare and the
      // user can retry without a corrective dialog.
    }
  }

  function handleDismiss() {
    writeShareDismissed(true);
    setShareDismissed(true);
  }

  return (
    // Two-target cluster — pill is the copy trigger, sibling X (when
    // shown) hides the share pill entirely. Mirrors the onboarding
    // pill's structure so both rows feel like the same chrome
    // family.
    <div className="inline-flex items-center gap-0.5 self-start">
      <button
        type="button"
        onClick={handleCopy}
        aria-label={t("copyAria", { url: displayUrl })}
        className="oh-focus-ring group inline-flex max-w-full items-center gap-2.5 rounded-(--oh-r-sm) bg-[var(--oh-paper)] px-3 py-1.5 shadow-[var(--oh-shadow-resting)] transition-shadow duration-150 ease-oh hover:shadow-[var(--oh-shadow-hover)]"
      >
        <LinkIcon
          aria-hidden
          strokeWidth={1.75}
          className="size-3.5 shrink-0 opacity-55 transition-opacity duration-150 ease-oh group-hover:opacity-100"
        />
        <span className="oh-eyebrow truncate opacity-100">{displayUrl}</span>
        {copied ? (
          // Brief success state — same size as the copy icon so the
          // pill width doesn't reflow when it swaps in.
          <CheckIcon
            aria-hidden
            strokeWidth={2.5}
            className="size-3 shrink-0 opacity-100"
          />
        ) : (
          <CopyIcon
            aria-hidden
            strokeWidth={2}
            className="size-3 shrink-0 opacity-35 transition-opacity duration-150 ease-oh group-hover:opacity-80"
          />
        )}
      </button>
      {showDismissX ? (
        <button
          type="button"
          onClick={handleDismiss}
          aria-label={t("hideAria")}
          className="oh-focus-ring inline-flex size-7 items-center justify-center rounded-(--oh-r-xs) text-[color:var(--oh-ink)] opacity-40 transition-[opacity,background-color] duration-150 ease-oh hover:bg-[var(--oh-tint-hover)] hover:opacity-100 focus-visible:opacity-100"
        >
          <XIcon strokeWidth={1.75} className="size-3.5" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
