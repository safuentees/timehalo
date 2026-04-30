"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { keepPreviousData } from "@tanstack/react-query";
import { trpc } from "@/trpc/hooks";
import { useRevokeApiKey } from "@/lib/mutations/use-revoke-api-key";
import { Button } from "@/components/ui/button";
import { ApiKeyCreateDialog } from "./api-key-create-dialog";
import { SectionHeader } from "@/components/oh/section-header";
import { OhInlineEmpty } from "@/components/oh/inline-empty";
import { OhSelect } from "@/components/oh/oh-select";
import { ConfirmDialog } from "@/components/oh/confirm-dialog";

export function ApiKeysFields() {
  const t = useTranslations("ApiKeys");
  const { data: workspaces, isLoading: workspacesLoading } =
    trpc.workspaces.list.useQuery();

  const [pickedSlug, setPickedSlug] = useState<string | null>(null);

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
  const { data: keys, isLoading } = trpc.workspaces.apiKeys.list.useQuery(
    { slug },
    { placeholderData: keepPreviousData },
  );
  const { data: plan } = trpc.billing.currentPlan.useQuery({ slug });
  const isLocked = plan?.plan === "FREE";

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
        {isLocked ? <UpgradePrompt /> : <ApiKeyCreateDialog slug={slug} />}
      </div>
    </>
  );
}

function UpgradePrompt() {
  const t = useTranslations("ApiKeys");
  return (
    <OhInlineEmpty>
      {t("upgradePrompt")}{" "}
      <a
        href="#billing-legend"
        className="underline decoration-dotted underline-offset-2 transition-opacity duration-150 ease-oh hover:opacity-100"
      >
        {t("upgradeLink")}
      </a>
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

  return (
    <article
      className={[
        "rounded-(--oh-r-sm) border-[1.5px] bg-oh-bg p-4 transition-colors duration-150 ease-oh",
        revoked
          ? "border-oh-line opacity-60"
          : "border-oh-line hover:border-oh-line-strong",
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
      </header>

      <p className="mt-2 truncate font-[family-name:var(--oh-mono)] text-[11px] font-extrabold tabular-nums opacity-55">
        {prefix}
        <span aria-hidden className="ml-0.5 tracking-[3px]">...</span>
      </p>
      {scopeList.length > 0 ? (
        <p
          className="mt-1 truncate oh-eyebrow opacity-45"
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
    <OhInlineEmpty className="mt-5">
      {t("noWorkspaceEmpty")}
    </OhInlineEmpty>
  );
}

function NoKeysEmpty() {
  const t = useTranslations("ApiKeys");
  return <OhInlineEmpty>{t("noKeysEmpty")}</OhInlineEmpty>;
}

