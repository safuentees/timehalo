"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  Check,
  MailCheck,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import { Menu } from "@base-ui/react/menu";
import { trpc } from "@/trpc/hooks";
import { useSetMemberRole } from "@/lib/mutations/use-set-member-role";
import { useRemoveMember } from "@/lib/mutations/use-remove-member";
import { useRevokeInvitation } from "@/lib/mutations/use-revoke-invitation";
import { useResendInvitation } from "@/lib/mutations/use-resend-invitation";
import { useUpdateInvitationRole } from "@/lib/mutations/use-update-invitation-role";
import { OhInlineEmpty } from "@/components/oh/inline-empty";
import { OhSelect } from "@/components/oh/oh-select";
import { OhPageHeader } from "@/components/oh/page-header";
import { OhPageShell } from "@/components/oh/page-shell";
import { ConfirmDialog } from "@/components/oh/confirm-dialog";
import { SectionHeader } from "@/components/oh/section-header";
import { OhCard } from "@/components/oh/oh-card";
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

      <div className="mt-4 flex flex-wrap items-center justify-between">
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
              <ul
                role="list"
                aria-labelledby="members-legend"
                className="flex flex-col gap-2.5"
              >
                {members.map((m) => (
                  <li key={m.id}>
                    <MemberRow
                      slug={slug}
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
  userId,
  name,
  email,
  role,
  canEdit,
  isOwner,
}: {
  slug: string;
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

  // Remove ConfirmDialog runs in controlled mode so the menu's
  // "Remove" item can open it without losing the typed-confirm
  // contract. Same pattern InvitationRow uses for revoke.
  const [removeOpen, setRemoveOpen] = useState(false);

  return (
    <OhCard className="p-4">
      {/* Header consolidated: text stack on the left, role badge +
          ⋯ Menu trigger on the right. The prior shape kept role
          select + trash button in a separate second flex row,
          which read as bottom-heavy on every member row even
          when the user wasn't editing. Now the role is visible
          at-a-glance via the badge; the ⋯ is the only entry
          point for changing role / removing the member. Same
          vocabulary as InvitationRow's actions menu. */}
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h3 className="text-[15px] leading-[1.2] font-black truncate">
            {name}
          </h3>
          <span className="oh-eyebrow normal-case tracking-[1.5px] text-[11px]">
            {email}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="oh-eyebrow tabular-nums">{t(`role_${role}`)}</span>
          {editable ? (
            <Menu.Root>
              <Menu.Trigger
                className="oh-focus-ring inline-flex size-9 items-center justify-center rounded-(--oh-r-xs) text-[color:var(--oh-content-muted)] transition-[color,background-color] duration-150 ease-oh hover:bg-[var(--oh-tint)] hover:text-[var(--oh-ink)] data-[popup-open]:bg-[var(--oh-tint)] data-[popup-open]:text-[var(--oh-ink)]"
                aria-label={t("memberActionsAria", { name })}
              >
                <MoreHorizontal
                  strokeWidth={1.75}
                  className="size-4"
                  aria-hidden
                />
              </Menu.Trigger>
              <Menu.Portal>
                <Menu.Positioner
                  className="oh-menu-positioner"
                  sideOffset={6}
                  align="end"
                  style={{ zIndex: 100 }}
                >
                  <Menu.Popup className="oh-menu-popup">
                    {/* Role radio-style group. The current role
                        carries a Check glyph; clicking another
                        role fires setRole.mutate. Disabled while
                        in flight to block re-entry. Server still
                        validates — this is just affordance gating
                        so a non-OWNER can't pick ADMIN here. */}
                    <Menu.Group>
                      <Menu.GroupLabel className="oh-menu-label">
                        {t("changeRole")}
                      </Menu.GroupLabel>
                      {allowedTargets.map((r) => {
                        const isCurrent = r === role;
                        return (
                          <Menu.Item
                            key={r}
                            className="oh-menu-item"
                            disabled={setRole.isPending || isCurrent}
                            onClick={() => {
                              if (isCurrent) return;
                              setRole.mutate({ slug, userId, role: r });
                            }}
                          >
                            <span className="oh-menu-item-glyph">
                              {isCurrent ? (
                                <Check
                                  aria-hidden
                                  strokeWidth={2}
                                  className="size-3.5"
                                />
                              ) : null}
                            </span>
                            <span>{t(`role_${r}`)}</span>
                          </Menu.Item>
                        );
                      })}
                    </Menu.Group>
                    <Menu.Separator className="oh-menu-separator" />
                    <Menu.Item
                      className="oh-menu-item"
                      disabled={remove.isPending}
                      // Open the controlled ConfirmDialog instead
                      // of firing the mutation directly —
                      // destructive actions follow the typed-confirm
                      // convention (oh-ui.md *Destructive actions*).
                      onClick={() => setRemoveOpen(true)}
                    >
                      <span className="oh-menu-item-glyph">
                        <Trash2
                          aria-hidden
                          strokeWidth={1.75}
                          className="size-4"
                        />
                      </span>
                      <span>{t("remove")}</span>
                    </Menu.Item>
                  </Menu.Popup>
                </Menu.Positioner>
              </Menu.Portal>
            </Menu.Root>
          ) : null}
        </div>
      </header>
      {/* Controlled-mode ConfirmDialog for the remove flow. Opened
          by the menu's "Remove" item, awaits the mutation, closes
          on resolve. */}
      <ConfirmDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        title={t("removeTitle", { name })}
        description={t("removeDescription")}
        confirmLabel={t("remove")}
        pendingLabel={t("removing")}
        cancelLabel={t("cancel")}
        pending={remove.isPending}
        onConfirm={() => remove.mutateAsync({ slug, userId })}
      />
    </OhCard>
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
    canGrantAdmin ? ["ADMIN", "MEMBER", "VIEWER"] : ["MEMBER", "VIEWER"];

  // Revoke ConfirmDialog is rendered in controlled mode (no
  // trigger) because the Menu.Item that opens it would otherwise
  // close the menu before its own click handler could fire the
  // dialog's open state. State lives at the row level so the
  // dialog can mount independently of the menu.
  const [revokeOpen, setRevokeOpen] = useState(false);

  return (
    <OhCard muted={accepted || expired} className="p-4">
      {/* `items-center` (was `items-baseline`) so the email-plus-
          status text stack aligns to the vertical CENTER of the
          form-control row on the right. Baseline alignment was
          fine when both sides were text (matched first-line
          baselines), but with the right side now being form
          controls (select + ⋯ button) — which have their own
          internal padding + no meaningful text baseline — baseline
          read as the email pinned to the dropdown's text baseline
          while "PENDING" hung below the controls' bottom edge.
          Center alignment middles the whole text stack against the
          controls' visual center. */}
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h3 className="text-[14px] leading-[1.2] font-black truncate">
            {email}
          </h3>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="oh-eyebrow">{t(`status_${status}`)}</span>
          </div>
        </div>
        {/* Compact action row: role select + ⋯ menu trigger.
            Replaces the prior three-affordance row (role / Resend
            text-button / Trash icon-button) which ran out of
            horizontal space on narrow viewports + read as cramped
            even on desktop. The Resend label was particularly
            noisy ("Resending…" pending state took ~80px). Now both
            destructive + non-destructive actions live behind the
            ⋯ glyph the rest of the app uses for compact action
            menus. */}
        <div className="flex flex-wrap items-center gap-2">
          {showActions ? (
            <OhSelect
              aria-label={t("inviteRoleLabel", { email })}
              value={role}
              onChange={(e) =>
                updateRole.mutateAsync({
                  slug,
                  invitationId,
                  role: e.target.value as "ADMIN" | "MEMBER" | "VIEWER",
                })
              }
              disabled={updateRole.isPending}
              wrapperClassName="w-fit"
              className="min-w-[100px] font-[family-name:var(--oh-mono)] text-[12px]"
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
            <Menu.Root>
              <Menu.Trigger
                className="oh-focus-ring inline-flex size-9 items-center justify-center rounded-(--oh-r-xs) text-[color:var(--oh-content-muted)] transition-[color,background-color] duration-150 ease-oh hover:bg-[var(--oh-tint)] hover:text-[var(--oh-ink)] data-[popup-open]:bg-[var(--oh-tint)] data-[popup-open]:text-[var(--oh-ink)]"
                aria-label={t("invitationActionsAria", { email })}
              >
                <MoreHorizontal
                  strokeWidth={1.75}
                  className="size-4"
                  aria-hidden
                />
              </Menu.Trigger>
              <Menu.Portal>
                <Menu.Positioner
                  className="oh-menu-positioner"
                  sideOffset={6}
                  align="end"
                  style={{ zIndex: 100 }}
                >
                  <Menu.Popup className="oh-menu-popup">
                    <Menu.Item
                      className="oh-menu-item"
                      disabled={resend.isPending}
                      onClick={() => resend.mutateAsync({ slug, invitationId })}
                    >
                      <span className="oh-menu-item-glyph">
                        <MailCheck
                          aria-hidden
                          strokeWidth={1.75}
                          className="size-4"
                        />
                      </span>
                      <span>
                        {resend.isPending ? t("resending") : t("resend")}
                      </span>
                    </Menu.Item>
                    <Menu.Separator className="oh-menu-separator" />
                    <Menu.Item
                      className="oh-menu-item"
                      disabled={revoke.isPending}
                      // Open the controlled ConfirmDialog instead
                      // of the mutation directly — destructive
                      // actions follow the typed-confirm convention
                      // (oh-ui.md *Destructive actions*). Menu
                      // closes naturally via its own onClick; the
                      // dialog mounts on the next tick.
                      onClick={() => setRevokeOpen(true)}
                    >
                      <span className="oh-menu-item-glyph">
                        <Trash2
                          aria-hidden
                          strokeWidth={1.75}
                          className="size-4"
                        />
                      </span>
                      <span>{t("revoke")}</span>
                    </Menu.Item>
                  </Menu.Popup>
                </Menu.Positioner>
              </Menu.Portal>
            </Menu.Root>
          ) : null}
        </div>
      </header>
      {/* Controlled-mode ConfirmDialog for the revoke flow. Opened
          by the menu's "Revoke" item, awaits the mutation, closes
          on resolve. */}
      <ConfirmDialog
        open={revokeOpen}
        onOpenChange={setRevokeOpen}
        title={t("revokeTitle")}
        description={t("revokeDescription", { email })}
        confirmLabel={t("revoke")}
        pendingLabel={t("revoking")}
        cancelLabel={t("cancel")}
        pending={revoke.isPending}
        onConfirm={() => revoke.mutateAsync({ slug, invitationId })}
      />
    </OhCard>
  );
}
