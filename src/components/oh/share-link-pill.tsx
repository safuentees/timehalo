"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CheckIcon, CopyIcon, LinkIcon, XIcon } from "lucide-react";
import { trpc } from "@/trpc/hooks";
import { env } from "@/env";

export function ShareLinkPill() {
  const t = useTranslations("Share");
  const utils = trpc.useUtils();
  const me = trpc.users.me.useQuery();
  const [copied, setCopied] = useState(false);

  const setDismissed = trpc.users.setShareLinkDismissed.useMutation({
    onMutate: async (input) => {
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

  const handle = me.data?.handle;
  const shareDismissed = me.data?.shareLinkDismissed ?? false;
  const base = env.NEXT_PUBLIC_APP_URL ?? "https://officehours.app";
  const fullUrl = handle ? `${base}/h/${handle}` : null;
  const displayUrl = fullUrl ? fullUrl.replace(/^https?:\/\//, "") : null;

  if (shareDismissed) return null;
  if (!fullUrl || !displayUrl) return null;

  const showDismissX = Boolean(me.data?.onboardingDismissed);

  async function handleCopy() {
    if (!fullUrl) return;
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
    }
  }

  function handleDismiss() {
    setDismissed.mutate({ dismissed: true });
  }

  return (
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
