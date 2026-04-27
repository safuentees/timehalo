"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { MinusCircleIcon } from "lucide-react";
import { keepPreviousData } from "@tanstack/react-query";
import { trpc } from "@/trpc/hooks";
import { useRevokeApiKey } from "@/lib/mutations/use-revoke-api-key";
import { Button } from "@/components/ui/button";
import { ApiKeyCreateDialog } from "./api-key-create-dialog";
import { SectionHeader } from "./section-header";

export function ApiKeysFields() {
  const t = useTranslations("ApiKeys");
  const { data: workspaces, isLoading: workspacesLoading } =
    trpc.workspaces.list.useQuery();

  const [pickedSlug, setPickedSlug] = useState<string | null>(null);

  const activeSlug =
    workspaces && workspaces.length > 0
      ? pickedSlug && workspaces.some((w) => w.slug === pickedSlug)
        ? pickedSlug
        : workspaces[0].slug
      : null;

  return (
    <section aria-labelledby="api-keys-legend">
      <SectionHeader
        legendId="api-keys-legend"
        legend={t("legend")}
        description={t("description")}
        action={activeSlug ? <ApiKeyCreateDialog slug={activeSlug} /> : null}
      />

      {workspacesLoading ? (
        <p className="mt-5 text-[13px] opacity-55">{t("loading")}</p>
      ) : !workspaces || workspaces.length === 0 ? (
        <NoWorkspaceEmpty />
      ) : (
        <ApiKeysForWorkspace
          workspaces={workspaces}
          slug={activeSlug as string}
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
  const { data: keys, isLoading } = trpc.workspaces.apiKeys.list.useQuery(
    { slug },
    { placeholderData: keepPreviousData },
  );

  return (
    <>
      {workspaces.length > 1 ? (
        <div className="mt-5">
          <label
            htmlFor="api-keys-workspace"
            className="font-[family-name:var(--bru-mono)] text-[11px] font-extrabold tracking-[2.5px] uppercase opacity-55"
          >
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
    </>
  );
}

function ApiKeyRow({
  slug,
  id,
  name,
  prefix,
  scopes,
  createdAt,
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
        "rounded-(--bru-r-sm) border-[1.5px] bg-bru-bg p-4 transition-colors duration-150 ease-bru",
        revoked
          ? "border-bru-line opacity-60"
          : "border-bru-line hover:border-bru-line-strong",
      ].join(" ")}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <div className="flex flex-col gap-1.5 min-w-0">
          <span className="font-[family-name:var(--bru-mono)] text-[10px] font-extrabold tracking-[2.2px] uppercase tabular-nums opacity-55">
            {fmtCreated(new Date(createdAt))}
          </span>
          <h3 className="text-[16px] leading-[1.2] font-black truncate">
            {name}
          </h3>
        </div>
        <span className="font-[family-name:var(--bru-mono)] text-[12px] font-extrabold tabular-nums">
          {prefix}…
        </span>
      </header>

      <ul
        role="list"
        className="mt-3 flex flex-wrap gap-1.5"
        aria-label={t("scopesLabel")}
      >
        {scopeList.map((s) => (
          <li
            key={s}
            className="font-[family-name:var(--bru-mono)] text-[10px] font-extrabold tracking-[1.5px] uppercase border-2 border-bru-line-strong px-2 py-1"
          >
            {s}
          </li>
        ))}
      </ul>

      <div className="mt-3 flex items-center justify-between gap-3">
        <span
          className={[
            "font-[family-name:var(--bru-mono)] text-[10px] font-extrabold tracking-[2px] uppercase",
            revoked ? "opacity-55" : "text-emerald-700 dark:text-emerald-400",
          ].join(" ")}
        >
          {revoked ? t("statusRevoked") : t("statusActive")}
        </span>
        {revoked ? null : (
          <Button
            type="button"
            variant="brutalistGhost"
            size="brutalist"
            onClick={() => {
              if (!window.confirm(t("revokeConfirm"))) return;
              revokeApiKey.mutate({ slug, keyId: id });
            }}
            disabled={revokeApiKey.isPending}
          >
            <MinusCircleIcon />
            {revokeApiKey.isPending ? t("revoking") : t("revoke")}
          </Button>
        )}
      </div>
    </article>
  );
}

function NoWorkspaceEmpty() {
  const t = useTranslations("ApiKeys");
  return (
    <p className="mt-5 text-[13px] opacity-55 border-[1.5px] border-dashed border-bru-line p-4 rounded-(--bru-r-xs)">
      {t("noWorkspaceEmpty")}
    </p>
  );
}

function NoKeysEmpty() {
  const t = useTranslations("ApiKeys");
  return (
    <p className="text-[13px] opacity-55 border-[1.5px] border-dashed border-bru-line p-4 rounded-(--bru-r-xs)">
      {t("noKeysEmpty")}
    </p>
  );
}

const MONTH_SHORT = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
] as const;

function fmtCreated(d: Date): string {
  return `CREATED ${MONTH_SHORT[d.getMonth()]} ${d.getDate()} ${d.getFullYear()}`;
}
