"use client";

import type { inferRouterOutputs } from "@trpc/server";
import { useTranslations } from "next-intl";
import { Link } from "next-view-transitions";
import { ArrowRightIcon } from "lucide-react";
import { trpc } from "@/trpc/hooks";
import type { AppRouter } from "@/trpc/router";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { OhPageShell } from "@/components/oh/page-shell";
import { OhVisitorShell } from "@/components/oh/oh-visitor-shell";

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
    <OhVisitorShell
      header={
        <div className="mx-auto flex w-full max-w-[760px] items-center justify-between gap-3 px-0">
          <span className="oh-eyebrow tabular-nums opacity-100">
            /w/{workspace.slug}
          </span>
          <span className="oh-eyebrow tabular-nums">
            {t("memberCount", { count: workspace.members.length })}
          </span>
        </div>
      }
    >
      <OhPageShell>
        <header className="flex flex-col gap-4">
          <span className="oh-eyebrow opacity-100">{t("eyebrow")}</span>
          <h1 className="text-[clamp(32px,1rem+4vw,52px)] font-black leading-[1.05] tracking-tight">
            {workspace.name}
          </h1>
          <p className="oh-description">{t("description")}</p>
        </header>

        {workspace.teamEventTypes.length > 0 ? (
          <section
            className="mt-12"
            aria-label={t("eventTypesLabel")}
          >
            <h2 className="oh-legend mb-4 opacity-100">
              {t("eventTypesHeading")}
            </h2>
            <ul
              role="list"
              className="border-y border-oh-line divide-y divide-oh-line"
            >
              {workspace.teamEventTypes.map((et) => (
                <li key={et.slug}>
                  <EventTypeRow slug={workspace.slug} eventType={et} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

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
    </OhVisitorShell>
  );
}

type TeamEventType =
  RouterOutputs["workspaces"]["publicGetBySlug"]["teamEventTypes"][number];

function EventTypeRow({
  slug,
  eventType,
}: {
  slug: string;
  eventType: TeamEventType;
}) {
  const t = useTranslations("TeamProfile");
  return (
    <Link
      href={`/w/${slug}/${eventType.slug}`}
      className="oh-focus-ring group flex items-center gap-4 px-4 py-4 transition-colors duration-150 ease-oh hover:bg-oh-tint-hover focus-visible:bg-oh-tint-hover"
    >
      <div className="flex flex-1 flex-col leading-tight">
        <span className="text-[15px] font-semibold">{eventType.name}</span>
        <span className="oh-eyebrow tabular-nums">
          {t("eventTypeMeta", {
            minutes: eventType.durationMins,
            count: eventType.hostCount,
          })}
        </span>
      </div>
      <ArrowRightIcon
        aria-hidden
        strokeWidth={1.75}
        className="size-4 opacity-55 transition-opacity duration-150 group-hover:opacity-100"
      />
    </Link>
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
      className="oh-focus-ring group flex items-center gap-4 px-4 py-4 transition-colors duration-150 ease-oh hover:bg-oh-tint-hover focus-visible:bg-oh-tint-hover"
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
