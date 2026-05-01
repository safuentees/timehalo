"use client";

import type { inferRouterOutputs } from "@trpc/server";
import { useTranslations } from "next-intl";
import { Link } from "next-view-transitions";
import { ArrowRightIcon } from "lucide-react";
import { trpc } from "@/trpc/hooks";
import type { AppRouter } from "@/trpc/router";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { OhPageShell } from "@/components/oh/page-shell";

type RouterOutputs = inferRouterOutputs<AppRouter>;

type Props = {
  slug: string;
  initialWorkspace: RouterOutputs["workspaces"]["publicGetBySlug"];
};

export default function TeamProfile({ slug, initialWorkspace }: Props) {
  const { data: fetched } = trpc.workspaces.publicGetBySlug.useQuery(
    { slug },
    { initialData: initialWorkspace },
  );
  const workspace = fetched ?? initialWorkspace;
  const t = useTranslations("TeamProfile");

  return (
    <main className="min-h-screen bg-oh-bg" id="top">
      <div className="border-b border-oh-line">
        <div className="mx-auto flex w-full max-w-[760px] items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <span className="oh-eyebrow tabular-nums opacity-100">
            /w/{workspace.slug}
          </span>
          <span className="oh-eyebrow tabular-nums">
            {t("memberCount", { count: workspace.members.length })}
          </span>
        </div>
      </div>

      <OhPageShell>
        <header className="flex flex-col gap-4">
          <span className="oh-eyebrow opacity-100">{t("eyebrow")}</span>
          <h1 className="text-[clamp(32px,1rem+4vw,52px)] font-black leading-[1.05] tracking-tight">
            {workspace.name}
          </h1>
          <p className="oh-description">{t("description")}</p>
        </header>

        <section className="mt-12" aria-label={t("listLabel")}>
          <h2 className="oh-legend mb-4 opacity-100">{t("listHeading")}</h2>
          {workspace.members.length === 0 ? (
            <p className="oh-description">{t("emptyDescription")}</p>
          ) : (
            <ul
              role="list"
              className="border-y border-oh-line divide-y divide-oh-line"
            >
              {workspace.members.map((member) => (
                <li key={member.id}>
                  <MemberRow member={member} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </OhPageShell>
    </main>
  );
}

type Member = RouterOutputs["workspaces"]["publicGetBySlug"]["members"][number];

function MemberRow({ member }: { member: Member }) {
  const t = useTranslations("TeamProfile");
  const displayName = member.name ?? member.handle;
  const initials = toInitials(displayName);

  return (
    <Link
      href={`/h/${member.handle}`}
      className="group flex items-center gap-4 px-4 py-4 transition-colors duration-150 ease-oh hover:bg-oh-tint-hover focus-visible:bg-oh-tint-hover focus-visible:outline-none"
    >
      <Avatar size="default">
        <AvatarImage src={member.image ?? undefined} alt={displayName} />
        <AvatarFallback className="bg-[color:var(--oh-tint)] font-[family-name:var(--oh-mono)] text-[10px] font-extrabold uppercase tracking-[1px]">
          {initials}
        </AvatarFallback>
      </Avatar>

      <div className="flex flex-1 flex-col leading-tight">
        <span className="text-[15px] font-semibold">{displayName}</span>
        <span className="oh-eyebrow tabular-nums">@{member.handle}</span>
      </div>

      {member.role === "OWNER" ? (
        <span className="oh-eyebrow tabular-nums opacity-55">
          {t("ownerBadge")}
        </span>
      ) : null}
      <ArrowRightIcon
        aria-hidden
        strokeWidth={1.75}
        className="size-4 opacity-55 transition-opacity duration-150 group-hover:opacity-100"
      />
    </Link>
  );
}

function toInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
