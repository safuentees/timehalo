"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { keepPreviousData } from "@tanstack/react-query";
import { trpc } from "@/trpc/hooks";
import { useRevokeApiKey } from "@/lib/mutations/use-revoke-api-key";
import { Button } from "@/components/ui/button";
import { ApiKeyCreateDialog } from "./api-key-create-dialog";
import { SectionHeader } from "@/components/brutalist/section-header";
import { BrutalistInlineEmpty } from "@/components/brutalist/inline-empty";
import { ConfirmDialog } from "@/components/brutalist/confirm-dialog";

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

  // Picker selection is a controlled override. Null = "use the first
  // workspace from the list" — derived at render time so we don't
  // need an effect to seed the state once the list arrives. React 19's
  // compiler ESLint rule blocks `setState` inside effects for this
  // exact pattern.
  const [pickedSlug, setPickedSlug] = useState<string | null>(null);

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
              : workspaces[0].slug
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

  return (
    <>
      {workspaces.length > 1 ? (
        <div className="mt-5">
          <label htmlFor="api-keys-workspace" className="bru-legend">
            {t("workspaceLabel")}
          </label>
          <select
            id="api-keys-workspace"
            value={slug}
            onChange={(e) => onSlugChange(e.target.value)}
            className="bru-input mt-2 min-w-[220px] font-[family-name:var(--bru-mono)] text-[14px]"
          >
            {workspaces.map((w) => (
              <option key={w.slug} value={w.slug}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="mt-5">
        {isLoading ? (
          <p className="text-[13px] opacity-55">{t("loading")}</p>
        ) : !keys || keys.length === 0 ? (
          <NoKeysEmpty />
        ) : (
          <ul role="list" className="flex flex-col gap-2.5">
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

      <div className="mt-4">
        <ApiKeyCreateDialog slug={slug} />
      </div>
    </>
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

  // Audit on 2026-04-27 found this row had two same-weight bru-eyebrow
  // bands bracketing the content (created-at top, status pill bottom),
  // a scope-chip wall whose 2px borders outweighed the card's own
  // 1.5px border, and a prefix display competing with the name in the
  // header. Compared to cal.com (name + status pill + one subtitle +
  // one ellipsis dropdown) and dub.co (name + partial key + last-used
  // + ellipsis dropdown), our row carried five competing layers.
  //
  // Rebuilt: row dim communicates revoked state (no status pill), the
  // prefix and joined-scope list become two muted footer lines (no
  // chip border wall), createdAt drops off the row entirely (audit log
  // is the source of truth for that data), and the Revoke button is
  // text-only (the MinusCircleIcon was decorative).

  return (
    <article
      className={[
        "rounded-(--bru-r-sm) border-[1.5px] bg-bru-bg p-4 transition-colors duration-150 ease-bru",
        revoked
          ? "border-bru-line opacity-60"
          : "border-bru-line hover:border-bru-line-strong",
      ].join(" ")}
    >
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <h3 className="min-w-0 flex-1 truncate text-[16px] font-black leading-[1.2]">
          {name}
        </h3>
        {revoked ? null : (
          <ConfirmDialog
            trigger={
              <Button
                type="button"
                variant="brutalistGhost"
                size="brutalist"
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
      </header>

      <p className="mt-2 truncate font-[family-name:var(--bru-mono)] text-[11px] font-extrabold tabular-nums opacity-55">
        {prefix}
        {/* Three separate periods + tracking — the unicode `…` is a single
            glyph that letter-spacing can't split, so it renders as three
            dots crammed together. Three periods are individual glyphs and
            tracking applies. Tight 3px gives the "continuation" feeling
            without floating away from the prefix. */}
        <span aria-hidden className="ml-0.5 tracking-[3px]">...</span>
      </p>
      {scopeList.length > 0 ? (
        <p
          className="mt-1 truncate bru-eyebrow opacity-45"
          aria-label={t("scopesLabel")}
        >
          {scopeList.join(" / ")}
        </p>
      ) : null}
    </article>
  );
}

function NoWorkspaceEmpty() {
  const t = useTranslations("ApiKeys");
  return (
    <BrutalistInlineEmpty className="mt-5">
      {t("noWorkspaceEmpty")}
    </BrutalistInlineEmpty>
  );
}

function NoKeysEmpty() {
  const t = useTranslations("ApiKeys");
  return <BrutalistInlineEmpty>{t("noKeysEmpty")}</BrutalistInlineEmpty>;
}

