"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CheckIcon, CopyIcon, LinkIcon, XIcon } from "lucide-react";
import { trpc } from "@/trpc/hooks";
import { env } from "@/env";

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
// Dismiss flow (B.PT-share-flash): the share-pill ships with NO
// dismiss X at first paint — the onboarding pill already owns the
// "X to dismiss chrome" affordance, and two side-by-side X buttons
// read as visual noise. Once the host dismisses the onboarding (its
// X disappears) the share-pill grows a sibling X so the pattern
// stays available without ever showing two dismiss controls at once.
//
// Dismissal state lives on the SERVER (`User.shareLinkDismissed`),
// prefetched alongside `users.me` in the bookings layout. Previously
// stored in localStorage which produced a visible flash on first
// paint for dismissed users: SSR rendered the pill, the post-mount
// localStorage read hid it one frame later. Server-readable state
// closes that hydration gap — the SSR pass already knows whether
// to render. Mirrors the `onboardingDismissed` pattern exactly.
export function ShareLinkPill() {
  const t = useTranslations("Share");
  const utils = trpc.useUtils();
  const me = trpc.users.me.useQuery();
  const [copied, setCopied] = useState(false);

  const setDismissed = trpc.users.setShareLinkDismissed.useMutation({
    onMutate: async (input) => {
      // Optimistic update — pill hides immediately on click without
      // waiting for the server roundtrip. Mirrors the onboarding-
      // pill's onMutate pattern so both dismiss flows feel
      // identically snappy.
      await utils.users.me.cancel();
      const prev = utils.users.me.getData();
      if (prev) {
        utils.users.me.setData(undefined, {
          ...prev,
          shareLinkDismissed: input.dismissed,
        });
      }
      return { prev };
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.prev) utils.users.me.setData(undefined, ctx.prev);
    },
  });

  // Build the URL purely from the env'd base (deterministic on SSR
  // + client). Previously fell back to `window.location.origin` post-
  // mount which forced a `useMounted` gate; with NEXT_PUBLIC_APP_URL
  // set in every environment the fallback is unreachable, so we drop
  // the mount dance and the flash it caused.
  const handle = me.data?.handle;
  const shareDismissed = me.data?.shareLinkDismissed ?? false;
  const base = env.NEXT_PUBLIC_APP_URL ?? "https://officehours.app";
  const fullUrl = handle ? `${base}/h/${handle}` : null;
  const displayUrl = fullUrl ? fullUrl.replace(/^https?:\/\//, "") : null;

  if (shareDismissed) return null;
  if (!fullUrl || !displayUrl) return null;

  // Sibling dismiss X only surfaces AFTER the onboarding pill has
  // been hidden. `onboardingDismissed` is server-state too, so this
  // gate doesn't introduce any client-only timing.
  const showDismissX = Boolean(me.data?.onboardingDismissed);

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
    setDismissed.mutate({ dismissed: true });
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
