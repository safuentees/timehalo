"use client";

import { useState } from "react";
import { Link } from "next-view-transitions";
import { useTranslations } from "next-intl";
import { ArrowLeftIcon, MinusCircleIcon } from "lucide-react";
import { trpc } from "@/trpc/hooks";
import { useSetMemberRole } from "@/lib/mutations/use-set-member-role";
import { useRemoveMember } from "@/lib/mutations/use-remove-member";
import { useRevokeInvitation } from "@/lib/mutations/use-revoke-invitation";
import { Button } from "@/components/ui/button";
import { BrutalistInlineEmpty } from "@/components/brutalist/inline-empty";
import { BrutalistPageHeader } from "@/components/brutalist/page-header";
import { BrutalistPageShell } from "@/components/brutalist/page-shell";
import { InviteMemberDialog } from "./invite-member-dialog";

const ROLE_OPTIONS = ["OWNER", "ADMIN", "MEMBER", "VIEWER"] as const;

export default function MembersPanel({ slug }: { slug: string }) {
  const t = useTranslations("Members");
  const tWorkspaces = useTranslations("Workspaces");
  const { data: workspace } = trpc.workspaces.get.useQuery({ slug });
  const { data: members, isLoading: membersLoading } =
    trpc.workspaces.listMembers.useQuery({ slug });
  const { data: invitations, isLoading: invitationsLoading } =
    trpc.workspaces.listInvitations.useQuery({ slug });

  const callerScopes = workspace?.callerScopes ?? [];
  const canWriteMembers = callerScopes.includes("members.write");
  const isOwner = workspace?.callerRole === "OWNER";

  return (
    <BrutalistPageShell>
      <BrutalistPageHeader title={workspace?.name ?? t("title")} />

      <div className="mt-4">
        <Link
          href="/workspaces"
          className="inline-flex items-center gap-1.5 font-[family-name:var(--bru-mono)] text-[10px] font-extrabold tracking-[2px] uppercase opacity-55 transition-opacity hover:opacity-100"
        >
          <ArrowLeftIcon className="size-3" aria-hidden />
          {tWorkspaces("backToList")}
        </Link>
      </div>

      <div className="mt-8 flex flex-col gap-12">
        <section aria-labelledby="members-legend">
          <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
            <div className="min-w-0 flex-1">
              <p id="members-legend" className="bru-legend">
                {t("legend")}
              </p>
              <p className="bru-description mt-3">{t("description")}</p>
            </div>
            {canWriteMembers ? (
              <div className="shrink-0 self-start">
                <InviteMemberDialog slug={slug} canGrantAdmin={isOwner} />
              </div>
            ) : null}
          </header>

          <div className="mt-5">
            {membersLoading ? (
              <p className="text-[13px] opacity-55">{t("loading")}</p>
            ) : !members || members.length === 0 ? (
              <BrutalistInlineEmpty>{t("listEmpty")}</BrutalistInlineEmpty>
            ) : (
              <ul role="list" aria-labelledby="members-legend" className="flex flex-col gap-2.5">
                {members.map((m) => (
                  <li key={m.id}>
                    <MemberRow
                      slug={slug}
                      memberId={m.id}
                      userId={m.user.id}
                      name={m.user.name ?? m.user.handle ?? m.user.email}
                      email={m.user.email}
                      role={m.role}
                      canEdit={canWriteMembers}
                      isOwner={isOwner}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section aria-labelledby="invitations-legend">
          <header>
            <p id="invitations-legend" className="bru-legend">
              {t("invitationsLegend")}
            </p>
            <p className="bru-description mt-3">{t("invitationsDescription")}</p>
          </header>

          <div className="mt-5">
            {invitationsLoading ? (
              <p className="text-[13px] opacity-55">{t("loading")}</p>
            ) : !invitations || invitations.length === 0 ? (
              <BrutalistInlineEmpty>{t("invitationsEmpty")}</BrutalistInlineEmpty>
            ) : (
              <ul
                role="list"
                aria-labelledby="invitations-legend"
                className="flex flex-col gap-2.5"
              >
                {invitations.map((inv) => (
                  <li key={inv.id}>
                    <InvitationRow
                      slug={slug}
                      invitationId={inv.id}
                      email={inv.email}
                      role={inv.role}
                      expiresAt={inv.expiresAt as unknown as string}
                      acceptedAt={inv.acceptedAt as unknown as string | null}
                      canRevoke={canWriteMembers}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </BrutalistPageShell>
  );
}

function MemberRow({
  slug,
  memberId,
  userId,
  name,
  email,
  role,
  canEdit,
  isOwner,
}: {
  slug: string;
  memberId: string;
  userId: string;
  name: string;
  email: string;
  role: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
  canEdit: boolean;
  isOwner: boolean;
}) {
  const t = useTranslations("Members");
  const setRole = useSetMemberRole();
  const remove = useRemoveMember();

  const editable = canEdit && role !== "OWNER";
  const allowedTargets = isOwner
    ? ROLE_OPTIONS.filter((r) => r !== "OWNER")
    : ROLE_OPTIONS.filter((r) => r === "MEMBER" || r === "VIEWER");

  return (
    <article className="rounded-(--bru-r-sm) border-[1.5px] border-bru-line bg-bru-bg p-4 transition-colors duration-150 ease-bru hover:border-bru-line-strong">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h3 className="text-[15px] leading-[1.2] font-black truncate">{name}</h3>
          <span className="font-[family-name:var(--bru-mono)] text-[11px] tracking-[1.5px] opacity-55">
            {email}
          </span>
        </div>
        <span className="font-[family-name:var(--bru-mono)] text-[10px] font-extrabold tracking-[2.2px] uppercase opacity-55">
          {t(`role_${role}`)}
        </span>
      </header>

      {editable ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label
            htmlFor={`role-${memberId}`}
            className="font-[family-name:var(--bru-mono)] text-[10px] font-extrabold tracking-[2px] uppercase opacity-55"
          >
            {t("changeRole")}
          </label>
          <select
            id={`role-${memberId}`}
            value={role}
            onChange={(e) => {
              const next = e.target.value as (typeof ROLE_OPTIONS)[number];
              if (next === role) return;
              setRole.mutate({ slug, userId, role: next });
            }}
            disabled={setRole.isPending}
            className="bru-input min-w-[140px] font-[family-name:var(--bru-mono)] text-[12px]"
          >
            {allowedTargets.map((r) => (
              <option key={r} value={r}>
                {t(`role_${r}`)}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="outline"
            size="brutalist"
            onClick={() => {
              if (!window.confirm(t("removeConfirm", { name }))) return;
              remove.mutate({ slug, userId });
            }}
            disabled={remove.isPending}
            className="ml-auto"
          >
            <MinusCircleIcon />
            {remove.isPending ? t("removing") : t("remove")}
          </Button>
        </div>
      ) : null}
    </article>
  );
}

function InvitationRow({
  slug,
  invitationId,
  email,
  role,
  expiresAt,
  acceptedAt,
  canRevoke,
}: {
  slug: string;
  invitationId: string;
  email: string;
  role: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
  expiresAt: string;
  acceptedAt: string | null;
  canRevoke: boolean;
}) {
  const t = useTranslations("Members");
  const revoke = useRevokeInvitation();
  const [expired] = useState(() => new Date(expiresAt).getTime() < Date.now());
  const accepted = acceptedAt !== null;
  const status = accepted ? "accepted" : expired ? "expired" : "pending";

  return (
    <article
      className={[
        "rounded-(--bru-r-sm) border-[1.5px] bg-bru-bg p-4 transition-colors duration-150 ease-bru",
        accepted || expired ? "border-bru-line opacity-60" : "border-bru-line hover:border-bru-line-strong",
      ].join(" ")}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h3 className="text-[14px] leading-[1.2] font-black truncate">{email}</h3>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-[family-name:var(--bru-mono)] text-[10px] font-extrabold tracking-[2px] uppercase opacity-55">
              {t(`role_${role}`)}
            </span>
            <span className="font-[family-name:var(--bru-mono)] text-[10px] font-extrabold tracking-[2px] uppercase opacity-55">
              {t(`status_${status}`)}
            </span>
          </div>
        </div>
        {canRevoke && !accepted ? (
          <Button
            type="button"
            variant="outline"
            size="brutalist"
            onClick={() => {
              if (!window.confirm(t("revokeConfirm", { email }))) return;
              revoke.mutate({ slug, invitationId });
            }}
            disabled={revoke.isPending}
          >
            {revoke.isPending ? t("revoking") : t("revoke")}
          </Button>
        ) : null}
      </header>
    </article>
  );
}
