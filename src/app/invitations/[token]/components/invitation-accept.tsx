"use client";

import { Link } from "next-view-transitions";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAcceptInvitation } from "@/lib/mutations/use-accept-invitation";
import { Button, buttonVariants } from "@/components/ui/button";

export default function InvitationAccept({
  token,
  workspaceSlug,
  workspaceName,
  email,
  role,
  expired,
  acceptedAtIso,
  isAuthed,
}: {
  token: string;
  workspaceSlug: string;
  workspaceName: string;
  email: string;
  role: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
  expiresAtIso: string;
  acceptedAtIso: string | null;
  expired: boolean;
  isAuthed: boolean;
}) {
  const t = useTranslations("Invitations");
  const router = useRouter();
  const accept = useAcceptInvitation({
    onSuccess: () => {
      router.push(`/workspaces/${workspaceSlug}/members`);
    },
  });

  const accepted = acceptedAtIso !== null;
  const status = accepted ? "accepted" : expired ? "expired" : "pending";
  const callbackUrl = `/invitations/${token}`;

  return (
    <div className="min-h-screen bg-oh-bg">
      <main className="mx-auto max-w-md px-6 pt-20 sm:pt-32">
        <header>
          <p className="oh-eyebrow">
            {t("eyebrow")}
          </p>
          <h1 className="mt-4 font-heading text-3xl font-black tracking-tight leading-none">
            {t("titleFor", { name: workspaceName })}
          </h1>
          <p className="mt-4 text-[14px] leading-[1.55] opacity-75 max-w-prose">
            {t("body", { email })}
          </p>
        </header>

        <dl className="mt-8 flex flex-col gap-3 border-t-2 border-oh-line-strong pt-6">
          <Detail label={t("workspaceLabel")} value={workspaceName} />
          <Detail label={t("emailLabel")} value={email} />
          <Detail label={t("roleLabel")} value={t(`role_${role}`)} />
          <Detail label={t("statusLabel")} value={t(`status_${status}`)} />
        </dl>

        <div className="mt-8 flex flex-col gap-3">
          {accepted ? (
            <Link
              href={`/workspaces/${workspaceSlug}/members`}
              className={`${buttonVariants({ variant: "outline", size: "oh" })} w-full`}
            >
              {t("openWorkspace")}
            </Link>
          ) : expired ? (
            <p className="font-[family-name:var(--oh-mono)] text-[11px] tracking-[1.5px] opacity-55">
              {t("expiredHint")}
            </p>
          ) : isAuthed ? (
            <Button
              type="button"
              variant="oh"
              size="oh"
              className="w-full"
              onClick={() => accept.mutate({ token })}
              disabled={accept.isPending}
            >
              {accept.isPending ? t("accepting") : t("accept")}
            </Button>
          ) : (
            <Link
              href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`}
              className={`${buttonVariants({ variant: "oh", size: "oh" })} w-full`}
            >
              {t("signInToAccept")}
            </Link>
          )}

          <Link
            href="/bookings"
            className="text-center font-[family-name:var(--oh-mono)] text-[11px] tracking-[1.5px] uppercase opacity-55 transition-opacity hover:opacity-100"
          >
            {t("notNow")}
          </Link>
        </div>
      </main>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-x-4">
      <dt className="oh-eyebrow">
        {label}
      </dt>
      <dd className="text-[13px] font-medium tabular-nums">{value}</dd>
    </div>
  );
}
