"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowLeftIcon, ArrowRightIcon, MinusCircleIcon } from "lucide-react";
import { trpc } from "@/trpc/hooks";
import { useSetMemberRole } from "@/lib/mutations/use-set-member-role";
import { useRemoveMember } from "@/lib/mutations/use-remove-member";
import { useRevokeInvitation } from "@/lib/mutations/use-revoke-invitation";
import { useResendInvitation } from "@/lib/mutations/use-resend-invitation";
import { useUpdateInvitationRole } from "@/lib/mutations/use-update-invitation-role";
import { Button } from "@/components/ui/button";
import { OhInlineEmpty } from "@/components/oh/inline-empty";
import { OhSelect } from "@/components/oh/oh-select";
import { OhPageHeader } from "@/components/oh/page-header";
import { OhPageShell } from "@/components/oh/page-shell";
import { ConfirmDialog } from "@/components/oh/confirm-dialog";
import { SectionHeader } from "@/components/oh/section-header";
import { InviteMemberDialog } from "./invite-member-dialog";

// Members panel for /workspaces/<slug>/members. Three sections
// stacked in the standard settings rhythm (mt-12 between them):
//   1. Members — list with role select + remove
//   2. Pending invitations — list with revoke
//   3. Invite — opens the invite dialog (lives in the section header)
//
// Permission gating reads from workspaces.get.callerScopes — the
// server returns the caller's scope set, the client toggles UI
// affordances on it. Server still enforces, this is just for the
// "don't show a button you can't use" UX.

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
    <OhPageShell>
      <OhPageHeader title={workspace?.name ?? t("title")} />

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
        <Link
          href="/workspaces"
          className="oh-eyebrow inline-flex items-center gap-1.5 transition-opacity hover:opacity-100"
        >
          <ArrowLeftIcon className="size-3" aria-hidden />
          {tWorkspaces("backToList")}
        </Link>
        <Link
          href={`/workspaces/${slug}/settings`}
          className="oh-eyebrow inline-flex items-center gap-1.5 transition-opacity hover:opacity-100"
        >
          {tWorkspaces("settingsLink")}
          <ArrowRightIcon className="size-3" aria-hidden />
        </Link>
      </div>

      <div className="mt-8 flex flex-col gap-12">
        <section aria-labelledby="members-legend">
          <SectionHeader
            legendId="members-legend"
            legend={t("legend")}
            description={t("description")}
            action={
              canWriteMembers ? (
                <InviteMemberDialog slug={slug} canGrantAdmin={isOwner} />
              ) : undefined
            }
          />

          <div className="mt-5">
            {membersLoading ? (
              <p className="text-[13px] opacity-55">{t("loading")}</p>
            ) : !members || members.length === 0 ? (
              <OhInlineEmpty>{t("listEmpty")}</OhInlineEmpty>
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
          <SectionHeader
            legendId="invitations-legend"
            legend={t("invitationsLegend")}
            description={t("invitationsDescription")}
          />

          <div className="mt-5">
            {invitationsLoading ? (
              <p className="text-[13px] opacity-55">{t("loading")}</p>
            ) : !invitations || invitations.length === 0 ? (
              <OhInlineEmpty>{t("invitationsEmpty")}</OhInlineEmpty>
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
                      canManage={canWriteMembers}
                      canGrantAdmin={isOwner}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </OhPageShell>
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

  // OWNER role can't be downgraded (server rejects). Only owner can
  // grant ADMIN; admins can shuffle MEMBER/VIEWER.
  const editable = canEdit && role !== "OWNER";
  const allowedTargets = isOwner
    ? ROLE_OPTIONS.filter((r) => r !== "OWNER")
    : ROLE_OPTIONS.filter((r) => r === "MEMBER" || r === "VIEWER");

  return (
    <article className="rounded-(--oh-r-sm) bg-oh-bg p-4 shadow-[0_3px_12px_rgba(0,0,0,0.22)] transition-[box-shadow,background-color] duration-150 ease-oh hover:shadow-[0_4px_16px_rgba(0,0,0,0.28)]">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h3 className="text-[15px] leading-[1.2] font-black truncate">{name}</h3>
          <span className="oh-eyebrow normal-case tracking-[1.5px] text-[11px]">
            {email}
          </span>
        </div>
        <span className="oh-eyebrow tabular-nums">
          {t(`role_${role}`)}
        </span>
      </header>

      {editable ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label htmlFor={`role-${memberId}`} className="oh-eyebrow">
            {t("changeRole")}
          </label>
          <OhSelect
            id={`role-${memberId}`}
            value={role}
            onChange={(e) => {
              const next = e.target.value as (typeof ROLE_OPTIONS)[number];
              if (next === role) return;
              setRole.mutate({ slug, userId, role: next });
            }}
            disabled={setRole.isPending}
            className="min-w-[140px] font-[family-name:var(--oh-mono)] text-[12px]"
          >
            {allowedTargets.map((r) => (
              <option key={r} value={r}>
                {t(`role_${r}`)}
              </option>
            ))}
          </OhSelect>
          <ConfirmDialog
            trigger={
              <Button
                type="button"
                variant="ohGhost"
                size="oh"
                disabled={remove.isPending}
                className="ml-auto"
              >
                <MinusCircleIcon />
                {remove.isPending ? t("removing") : t("remove")}
              </Button>
            }
            title={t("removeTitle", { name })}
            description={t("removeDescription")}
            confirmLabel={t("remove")}
            pendingLabel={t("removing")}
            cancelLabel={t("cancel")}
            pending={remove.isPending}
            onConfirm={() => remove.mutateAsync({ slug, userId })}
          />
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
  canManage,
  canGrantAdmin,
}: {
  slug: string;
  invitationId: string;
  email: string;
  role: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
  expiresAt: string;
  acceptedAt: string | null;
  canManage: boolean;
  canGrantAdmin: boolean;
}) {
  const t = useTranslations("Members");
  const revoke = useRevokeInvitation();
  const resend = useResendInvitation();
  const updateRole = useUpdateInvitationRole();
  // React 19's compiler ESLint rule (`react-hooks/set-state-in-effect`,
  // and the impure-call check) flags `Date.now()` during render. Read
  // it once at mount via lazy useState — invitation expiry is a 7-day
  // window so it doesn't need to re-evaluate within a single session.
  const [expired] = useState(() => new Date(expiresAt).getTime() < Date.now());
  const accepted = acceptedAt !== null;
  const status = accepted ? "accepted" : expired ? "expired" : "pending";
  const pending = !accepted;
  const showActions = canManage && pending;

  // Match the invite procedure's role rules: ADMIN requires the
  // caller to be OWNER; MEMBER + VIEWER + (existing) ADMIN are
  // always selectable. The server enforces; this just keeps a
  // non-OWNER caller from seeing an option that bounces.
  const ROLE_OPTIONS: ReadonlyArray<"ADMIN" | "MEMBER" | "VIEWER"> =
    canGrantAdmin
      ? ["ADMIN", "MEMBER", "VIEWER"]
      : ["MEMBER", "VIEWER"];

  return (
    <article
      className={[
        "rounded-(--oh-r-sm) bg-oh-bg p-4 shadow-[0_3px_12px_rgba(0,0,0,0.22)] transition-[box-shadow,background-color,opacity] duration-150 ease-oh",
        accepted || expired
          ? "opacity-60"
          : "hover:shadow-[0_4px_16px_rgba(0,0,0,0.28)]",
      ].join(" ")}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h3 className="text-[14px] leading-[1.2] font-black truncate">{email}</h3>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="oh-eyebrow">{t(`status_${status}`)}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {showActions ? (
            <OhSelect
              aria-label={t("inviteRoleLabel", { email })}
              value={role}
              onChange={(e) =>
                updateRole.mutateAsync({
                  slug,
                  invitationId,
                  role: e.target.value as
                    | "ADMIN"
                    | "MEMBER"
                    | "VIEWER",
                })
              }
              disabled={updateRole.isPending}
              className="font-[family-name:var(--oh-mono)] text-[12px]"
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {t(`role_${r}`)}
                </option>
              ))}
            </OhSelect>
          ) : (
            <span className="oh-eyebrow">{t(`role_${role}`)}</span>
          )}
          {showActions ? (
            <Button
              type="button"
              variant="ohGhost"
              size="oh"
              disabled={resend.isPending}
              onClick={() =>
                resend.mutateAsync({ slug, invitationId })
              }
            >
              {resend.isPending ? t("resending") : t("resend")}
            </Button>
          ) : null}
          {showActions ? (
            <ConfirmDialog
              trigger={
                <Button
                  type="button"
                  variant="ohGhost"
                  size="oh"
                  disabled={revoke.isPending}
                >
                  {revoke.isPending ? t("revoking") : t("revoke")}
                </Button>
              }
              title={t("revokeTitle")}
              description={t("revokeDescription", { email })}
              confirmLabel={t("revoke")}
              pendingLabel={t("revoking")}
              cancelLabel={t("cancel")}
              pending={revoke.isPending}
              onConfirm={() =>
                revoke.mutateAsync({ slug, invitationId })
              }
            />
          ) : null}
        </div>
      </header>
    </article>
  );
}
