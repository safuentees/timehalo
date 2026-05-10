"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { keepPreviousData } from "@tanstack/react-query";
import { trpc } from "@/trpc/hooks";
import { useRevokeApiKey } from "@/lib/mutations/use-revoke-api-key";
import { Button } from "@/components/ui/button";
import { ApiKeyCreateDialog } from "./api-key-create-dialog";
import { SectionHeader } from "@/components/oh/section-header";
import { OhInlineEmpty } from "@/components/oh/inline-empty";
import { OhSelect } from "@/components/oh/oh-select";
import { Info } from "lucide-react";
import { Popover } from "@base-ui/react/popover";
import { ConfirmDialog } from "@/components/oh/confirm-dialog";
import { OhCard } from "@/components/oh/oh-card";

// Workspace API keys section. Surface flow:
//
//   - Zero workspaces → empty-state CTA pointing at workspace creation
//     (Unit 1 lands the host's first workspace at signup; this branch
//     is the pre-Unit-1 fallback so older accounts don't see a dead
//     "Create key" button).
//   - One+ workspaces → workspace picker dropdown above the key list.
//     The list shows name, prefix, scopes, status (active / revoked),
//     and a revoke button on active rows. Token values themselves only
//     ever surface in <ApiKeyCreateDialog />'s reveal step.
//
// Pattern reference: dub /apps/web/ui/tokens/token-card.tsx — same
// per-row revoke action, prefix-only list display.

export function ApiKeysFields() {
  const t = useTranslations("ApiKeys");
  const { data: workspaces, isLoading: workspacesLoading } =
    trpc.workspaces.list.useQuery();

  // Picker selection is a controlled override. Null = "use the
  // active workspace's slug" — derived at render time so we don't
  // need an effect to seed the state once the list arrives. React 19's
  // compiler ESLint rule blocks `setState` inside effects for this
  // exact pattern.
  const [pickedSlug, setPickedSlug] = useState<string | null>(null);

  // B.PT17 — reset the local override when the active workspace
  // changes (topbar switcher click + cookie flip). Without this, a
  // user who manually picked workspace A from this section's
  // dropdown stays pinned to A even after the topbar navigates to
  // workspace B — the list shows A's keys while the topbar says B,
  // which is the bug the audit on 2026-04-29 surfaced.
  //
  // React 19's "setState during render" pattern: compare the
  // current value against a snapshot kept in state, sync the
  // snapshot + reset the override in render. Triggers an immediate
  // re-render on the next pass and avoids the
  // `react-hooks/set-state-in-effect` rule.
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
    <section aria-labelledby="api-keys-legend">
      <SectionHeader
        legendId="api-keys-legend"
        legend={t("legend")}
        description={t("description")}
      />

      {workspacesLoading ? (
        <p className="mt-5 text-[13px] opacity-55">{t("loading")}</p>
      ) : !workspaces || workspaces.length === 0 ? (
        <NoWorkspaceEmpty />
      ) : (
        <ApiKeysForWorkspace
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

function ApiKeysForWorkspace({
  workspaces,
  slug,
  onSlugChange,
}: {
  workspaces: WorkspaceListItem[];
  slug: string;
  onSlugChange: (slug: string) => void;
}) {
  const t = useTranslations("ApiKeys");
  // `placeholderData: keepPreviousData` keeps the previously rendered
  // list visible while the next workspace's keys load. Without it,
  // switching workspaces in the picker flashes "Loading…" between
  // every option — not because the query is slow, but because the
  // component re-mounts the loading branch the moment the input
  // changes. Cal.com uses the same flag on their out-of-office
  // pagination list. React Query v5 idiom (was `keepPreviousData:
  // true` in v4 — now imported from "@tanstack/react-query").
  const { data: keys, isLoading } = trpc.workspaces.apiKeys.list.useQuery(
    { slug },
    { placeholderData: keepPreviousData },
  );
  // Plan gate. `apiKeys` is a PRO+ feature in PLAN_FEATURES; the
  // procedure throws FORBIDDEN with "Your plan (FREE) does not
  // include api-keys" on create. Surfacing the constraint inline
  // here means the user understands the gate before clicking, and
  // gets a path to resolve it without hunting for billing.
  // `currentPlan` returns `callerRole` + `owner` (B.PT284) so the
  // upgrade prompt + create gate render member-aware copy without
  // a second query.
  const { data: plan } = trpc.billing.currentPlan.useQuery({ slug });
  const isLocked = plan?.plan === "FREE";
  const isOwner = plan?.callerRole === "OWNER";

  return (
    <>
      {workspaces.length > 1 ? (
        <div className="mt-5">
          <label htmlFor="api-keys-workspace" className="oh-legend">
            {t("workspaceLabel")}
          </label>
          <div className="mt-2">
            <OhSelect
              id="api-keys-workspace"
              value={slug}
              onChange={(e) => onSlugChange(e.target.value)}
              wrapperClassName="w-full sm:w-fit"
              className="w-full font-[family-name:var(--oh-mono)] text-[14px] sm:w-auto sm:min-w-[220px]"
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
          no keys. The upgrade prompt below already communicates "you
          can't use this feature yet"; an additional "No keys yet"
          empty above it just stacks two empty-state messages on top
          of each other. If a downgraded user still has keys, render
          them so they can revoke. */}
      {!isLocked || (keys && keys.length > 0) ? (
        <div className="mt-5">
          {isLoading ? (
            <p className="text-[13px] opacity-55">{t("loading")}</p>
          ) : !keys || keys.length === 0 ? (
            <NoKeysEmpty />
          ) : (
            <ul
              role="list"
              // `[&>li]:min-w-0` opts every <li> child into shrinking
              // past content min-width (default `min-width: auto` on
              // flex-row items prevents shrink past content). Without
              // it a long key name with `truncate`'s `white-space:
              // nowrap` would push the chain wider than the panel.
              className="flex flex-col gap-2.5 [&>li]:min-w-0"
            >
              {keys.map((k) => (
                <li key={k.id}>
                  <ApiKeyRow
                    slug={slug}
                    id={k.id}
                    name={k.name}
                    prefix={k.prefix}
                    scopes={k.scopes}
                    createdAt={k.createdAt as unknown as string}
                    revokedAt={k.revokedAt as unknown as string | null}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <div className="mt-4">
        {isLocked ? (
          <UpgradePrompt
            isOwner={isOwner}
            ownerName={plan?.owner?.name ?? plan?.owner?.handle ?? null}
          />
        ) : (
          // VIEWERs can't create keys (no workspace.write); hide
          // the create CTA for them. ADMIN+ on a Pro workspace
          // still see it.
          plan?.callerRole === "VIEWER" ? null : (
            <ApiKeyCreateDialog slug={slug} />
          )
        )}
      </div>
    </>
  );
}

function UpgradePrompt({
  isOwner,
  ownerName,
}: {
  isOwner: boolean;
  ownerName: string | null;
}) {
  const t = useTranslations("ApiKeys");
  // Non-OWNER + we know the owner's display name → render the
  // "Ask {ownerName} to upgrade" copy with no clickable upgrade
  // link (they can't action it).
  if (!isOwner && ownerName) {
    return (
      <OhInlineEmpty>
        {t("upgradePromptAskOwner", { ownerName })}
      </OhInlineEmpty>
    );
  }
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

function ApiKeyRow({
  slug,
  id,
  name,
  prefix,
  scopes,
  revokedAt,
}: {
  slug: string;
  id: string;
  name: string;
  prefix: string;
  scopes: string;
  createdAt: string;
  revokedAt: string | null;
}) {
  const t = useTranslations("ApiKeys");
  const revoked = !!revokedAt;
  const revokeApiKey = useRevokeApiKey();
  const scopeList = scopes
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // Audit on 2026-04-27 found this row had two same-weight oh-eyebrow
  // bands bracketing the content (created-at top, status pill bottom),
  // a scope-chip wall whose 2px borders outweighed the card's own
  // 1.5px border, and a prefix display competing with the name in the
  // header. Compared to cal.com (name + status pill + one subtitle +
  // one ellipsis dropdown) and dub.co (name + partial key + last-used
  // + ellipsis dropdown), our row carried five competing layers.
  //
  // Depth-card chrome via <OhCard>. Replaces the prior 1.5px-border
  // article (border-oh-line + hover-line-strong + opacity-60 on
  // revoked). Revoked keys map to OhCard's `muted` state which bakes
  // 60% opacity + drops the hover lift. Same one-source-of-truth
  // shape billing / workflows / workspace-list rows already use.
  //
  // Rebuilt: row dim communicates revoked state (no status pill), the
  // prefix and joined-scope list become two muted footer lines (no
  // chip border wall), createdAt drops off the row entirely (audit log
  // is the source of truth for that data), and the Revoke button is
  // text-only (the MinusCircleIcon was decorative).

  // `min-w-0` on the OhCard breaks the "flex items don't shrink
  // past content min-width" chain. Without it, a long prefix (or
  // long key name with `truncate`'s `white-space: nowrap`) forces
  // the card wider than the panel on mobile.
  //
  // Mobile-cramped metadata (scope list) hides behind an Info
  // popover so narrow viewports don't render two truncated mono
  // lines on top of each other. Desktop keeps it inline.
  return (
    <OhCard muted={revoked} className="min-w-0 p-4">
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <h3 className="min-w-0 flex-1 truncate text-[16px] font-black leading-[1.2]">
          {name}
        </h3>
        <div className="flex shrink-0 items-center gap-1">
          {scopeList.length > 0 ? (
            // Info popover for the scope list — mobile only
            // (`sm:hidden`). On desktop the same content renders
            // inline below the prefix via `hidden sm:block`.
            <Popover.Root>
              <Popover.Trigger
                className="oh-focus-ring inline-flex size-7 shrink-0 items-center justify-center rounded-(--oh-r-xs) text-[color:var(--oh-content-muted)] transition-[color,background-color] duration-150 ease-oh hover:bg-[var(--oh-tint)] hover:text-[var(--oh-ink)] data-[popup-open]:bg-[var(--oh-tint)] data-[popup-open]:text-[var(--oh-ink)] sm:hidden"
                aria-label={t("infoLabel")}
              >
                <Info
                  strokeWidth={1.75}
                  className="size-4"
                  aria-hidden
                />
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Positioner
                  sideOffset={6}
                  align="end"
                  style={{ zIndex: 100 }}
                >
                  <Popover.Popup className="flex max-w-[260px] flex-col gap-2 rounded-(--oh-r-sm) bg-[color:var(--oh-paper)] p-3 shadow-[var(--oh-shadow-resting)]">
                    <p
                      className="oh-eyebrow opacity-65"
                      aria-label={t("scopesLabel")}
                    >
                      {scopeList.join(" / ")}
                    </p>
                  </Popover.Popup>
                </Popover.Positioner>
              </Popover.Portal>
            </Popover.Root>
          ) : null}
          {revoked ? null : (
            <ConfirmDialog
              trigger={
                <Button
                  type="button"
                  variant="ohGhost"
                  size="oh"
                  disabled={revokeApiKey.isPending}
                >
                  {revokeApiKey.isPending ? t("revoking") : t("revoke")}
                </Button>
              }
              title={t("revokeTitle")}
              description={t("revokeConfirm")}
              confirmLabel={t("revoke")}
              pendingLabel={t("revoking")}
              cancelLabel={t("cancel")}
              pending={revokeApiKey.isPending}
              onConfirm={() => revokeApiKey.mutateAsync({ slug, keyId: id })}
            />
          )}
        </div>
      </header>

      <p className="mt-2 min-w-0 truncate font-[family-name:var(--oh-mono)] text-[11px] font-extrabold tabular-nums opacity-55">
        {prefix}
        {/* Three separate periods + tracking — the unicode `…` is a single
            glyph that letter-spacing can't split, so it renders as three
            dots crammed together. Three periods are individual glyphs and
            tracking applies. Tight 3px gives the "continuation" feeling
            without floating away from the prefix. */}
        <span aria-hidden className="ml-0.5 tracking-[3px]">...</span>
      </p>
      {scopeList.length > 0 ? (
        // Inline scope list — hidden on mobile via `hidden sm:block`,
        // surfaced through the Info popover above.
        <p
          className="mt-1 hidden truncate oh-eyebrow opacity-45 sm:block"
          aria-label={t("scopesLabel")}
        >
          {scopeList.join(" / ")}
        </p>
      ) : null}
    </OhCard>
  );
}

function NoWorkspaceEmpty() {
  const t = useTranslations("ApiKeys");
  return (
    <OhInlineEmpty className="mt-5">
      {t("noWorkspaceEmpty")}
    </OhInlineEmpty>
  );
}

function NoKeysEmpty() {
  const t = useTranslations("ApiKeys");
  return <OhInlineEmpty>{t("noKeysEmpty")}</OhInlineEmpty>;
}

