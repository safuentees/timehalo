"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { keepPreviousData } from "@tanstack/react-query";
import { trpc } from "@/trpc/hooks";
import { useDeleteWebhook } from "@/lib/mutations/use-delete-webhook";
import { Button } from "@/components/ui/button";
import { WebhookCreateDialog } from "./webhook-create-dialog";
import { SectionHeader } from "@/components/oh/section-header";
import { OhInlineEmpty } from "@/components/oh/inline-empty";
import { OhSelect } from "@/components/oh/oh-select";
import { ConfirmDialog } from "@/components/oh/confirm-dialog";

// Workspace webhook subscriptions section. Mirrors the API keys
// surface (`api-keys-fields.tsx`) — same workspace picker, same plan
// gate, same row chrome and delete confirm. Webhook-specific bits:
//   - Subscriber URL is the "name" surrogate (humans recognize URL
//     hostname; we don't ask for a label).
//   - Events list is space-separated mono caps (`booking.created
//     booking.cancelled`).
//   - Active/inactive read-only — the cron processor flips a sub to
//     inactive when a receiver returns 410 GONE; we just surface it.
//   - Delete is the only mutation (no rotate-secret yet — the user
//     deletes + re-creates; same pattern dub.co uses).

export function WebhooksFields() {
  const t = useTranslations("Webhooks");
  const { data: workspaces, isLoading: workspacesLoading } =
    trpc.workspaces.list.useQuery();

  const [pickedSlug, setPickedSlug] = useState<string | null>(null);

  // Same reset-on-active-change pattern as ApiKeysFields (B.PT17). When
  // the topbar switcher flips the active workspace via cookie, drop
  // the local override so the section follows the topbar instead of
  // pinning to a stale slug. Render-time setState pattern avoids the
  // React 19 `react-hooks/set-state-in-effect` rule.
  const activeSlug =
    workspaces?.find((w) => w.isActive)?.slug ??
    workspaces?.[0]?.slug ??
    null;
  const [prevActiveSlug, setPrevActiveSlug] = useState<string | null>(
    activeSlug,
  );
  if (activeSlug !== prevActiveSlug) {
    setPrevActiveSlug(activeSlug);
    setPickedSlug(null);
  }

  return (
    <section aria-labelledby="webhooks-legend">
      <SectionHeader
        legendId="webhooks-legend"
        legend={t("legend")}
        description={t("description")}
      />

      {workspacesLoading ? (
        <p className="mt-5 text-[13px] opacity-55">{t("loading")}</p>
      ) : !workspaces || workspaces.length === 0 ? (
        <NoWorkspaceEmpty />
      ) : (
        <WebhooksForWorkspace
          workspaces={workspaces}
          slug={
            pickedSlug && workspaces.some((w) => w.slug === pickedSlug)
              ? pickedSlug
              : (activeSlug ?? workspaces[0].slug)
          }
          onSlugChange={setPickedSlug}
        />
      )}
    </section>
  );
}

type WorkspaceListItem = {
  slug: string;
  name: string;
  isActive: boolean;
};

function WebhooksForWorkspace({
  workspaces,
  slug,
  onSlugChange,
}: {
  workspaces: WorkspaceListItem[];
  slug: string;
  onSlugChange: (slug: string) => void;
}) {
  const t = useTranslations("Webhooks");
  // `placeholderData: keepPreviousData` — same flag the api-keys
  // section uses. Switching workspaces in the picker keeps the prior
  // list visible while the new query resolves; without it every
  // select change flashes "Loading…".
  const { data: subs, isLoading } = trpc.webhooks.list.useQuery(
    { slug },
    { placeholderData: keepPreviousData },
  );
  // PRO+ feature gate. `webhooks.create` throws FORBIDDEN with
  // "Your plan (FREE) does not include webhooks" on submit; we
  // surface the constraint inline so the user understands why the
  // create button is replaced with an upgrade prompt.
  const { data: plan } = trpc.billing.currentPlan.useQuery({ slug });
  const isLocked = plan?.plan === "FREE";

  return (
    <>
      {workspaces.length > 1 ? (
        <div className="mt-5">
          <label htmlFor="webhooks-workspace" className="oh-legend">
            {t("workspaceLabel")}
          </label>
          <div className="mt-2">
            <OhSelect
              id="webhooks-workspace"
              value={slug}
              onChange={(e) => onSlugChange(e.target.value)}
              wrapperClassName="w-fit"
              className="min-w-[220px] font-[family-name:var(--oh-mono)] text-[14px]"
            >
              {workspaces.map((w) => (
                <option key={w.slug} value={w.slug}>
                  {w.name}
                </option>
              ))}
            </OhSelect>
          </div>
        </div>
      ) : null}

      {/* List slot — skipped entirely when the user is locked AND has
          no subscriptions. The upgrade prompt below already
          communicates "you can't use this feature yet"; an additional
          "No webhooks yet" empty above would stack two empty-state
          messages. If a downgraded user still has subscriptions,
          render them so they can delete. */}
      {!isLocked || (subs && subs.length > 0) ? (
        <div className="mt-5">
          {isLoading ? (
            <p className="text-[13px] opacity-55">{t("loading")}</p>
          ) : !subs || subs.length === 0 ? (
            <NoSubsEmpty />
          ) : (
            <ul role="list" className="flex flex-col gap-2.5">
              {subs.map((s) => (
                <li key={s.publicUid}>
                  <WebhookRow
                    slug={slug}
                    publicUid={s.publicUid}
                    subscriberUrl={s.subscriberUrl}
                    events={s.events}
                    active={s.active}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <div className="mt-4">
        {isLocked ? <UpgradePrompt /> : <WebhookCreateDialog slug={slug} />}
      </div>
    </>
  );
}

function UpgradePrompt() {
  const t = useTranslations("Webhooks");
  return (
    <OhInlineEmpty>
      {t("upgradePrompt")}{" "}
      <Link
        href="/settings/billing"
        // Cross-route nav to the billing page. Was `href="#billing-
        // legend"` (an in-page anchor) — but the `id="billing-legend"`
        // only exists on /settings/billing's section, so on
        // /settings/developer the anchor pointed at nothing and the
        // click was a no-op. Next.js `<Link>` is the right vehicle
        // here: client-side route nav, prefetch on hover, scroll-to-
        // top on the destination by default.
        // Underline utilities need the `!` prefix because globals.css
        // ships an unlayered `:where(.oh-root a) { text-decoration:
        // none }` shell reset; unlayered CSS beats Tailwind's
        // utilities layer (Cascade Layers spec) regardless of
        // specificity, so the bare `underline` class would render as
        // no decoration. Same gotcha + same fix as the
        // bookings-list "View preview" link.
        className="oh-focus-ring !underline !underline-offset-4 !decoration-[1.5px] !decoration-current transition-opacity duration-150 ease-oh hover:opacity-100"
      >
        {t("upgradeLink")}
      </Link>
    </OhInlineEmpty>
  );
}

function WebhookRow({
  slug,
  publicUid,
  subscriberUrl,
  events,
  active,
}: {
  slug: string;
  publicUid: string;
  subscriberUrl: string;
  events: string;
  active: boolean;
}) {
  const t = useTranslations("Webhooks");
  const deleteWebhook = useDeleteWebhook();
  // CSV → display list. Same shape as api-keys-fields' scope joiner.
  const eventList = events
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // Row treatment matches api-keys-fields' rebuilt shape (B.PT-era
  // audit dropped the status pills + chip walls in favor of dim-on-
  // inactive + plain mono footer). `active=false` rows fade; otherwise
  // hairline border with hover-strong-border. Delete is text-only.
  return (
    <article
      className={[
        "rounded-(--oh-r-sm) border-[1.5px] bg-oh-bg p-4 transition-colors duration-150 ease-oh",
        active
          ? "border-oh-line hover:border-oh-line-strong"
          : "border-oh-line opacity-60",
      ].join(" ")}
    >
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <h3 className="min-w-0 flex-1 truncate text-[16px] font-black leading-[1.2]">
          {subscriberUrl}
        </h3>
        <ConfirmDialog
          trigger={
            <Button
              type="button"
              variant="ohGhost"
              size="oh"
              disabled={deleteWebhook.isPending}
            >
              {deleteWebhook.isPending ? t("deleting") : t("delete")}
            </Button>
          }
          title={t("deleteTitle")}
          description={t("deleteConfirm")}
          confirmLabel={t("delete")}
          pendingLabel={t("deleting")}
          cancelLabel={t("cancel")}
          pending={deleteWebhook.isPending}
          onConfirm={() => deleteWebhook.mutateAsync({ slug, publicUid })}
        />
      </header>

      {eventList.length > 0 ? (
        <p
          className="mt-2 truncate oh-eyebrow opacity-45"
          aria-label={t("eventsListLabel")}
        >
          {eventList.join(" / ")}
        </p>
      ) : null}
      {!active ? (
        <p className="mt-2 text-[12px] opacity-55">{t("inactiveHint")}</p>
      ) : null}
    </article>
  );
}

function NoWorkspaceEmpty() {
  const t = useTranslations("Webhooks");
  return (
    <OhInlineEmpty className="mt-5">
      {t("noWorkspaceEmpty")}
    </OhInlineEmpty>
  );
}

function NoSubsEmpty() {
  const t = useTranslations("Webhooks");
  return <OhInlineEmpty>{t("noSubsEmpty")}</OhInlineEmpty>;
}
