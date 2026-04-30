"use client";

import { Link } from "next-view-transitions";
import { useTranslations } from "next-intl";
import { ArrowRightIcon } from "lucide-react";
import { trpc } from "@/trpc/hooks";
import { OhInlineEmpty } from "@/components/oh/inline-empty";
import { OhPageHeader } from "@/components/oh/page-header";
import { OhPageShell } from "@/components/oh/page-shell";
import { SectionHeader } from "@/components/oh/section-header";
import { WorkspaceCreateDialog } from "./workspace-create-dialog";

export default function WorkspacesList() {
  const t = useTranslations("Workspaces");
  const { data, isLoading } = trpc.workspaces.list.useQuery();

  return (
    <OhPageShell>
      <OhPageHeader title={t("title")} />

      <section
        aria-labelledby="workspaces-legend"
        className="mt-8"
      >
        <SectionHeader
          legendId="workspaces-legend"
          legend={t("legend")}
          description={t("description")}
          action={<WorkspaceCreateDialog />}
        />

        <div className="mt-5">
          {isLoading ? (
            <p className="text-[13px] opacity-55">{t("loading")}</p>
          ) : !data || data.length === 0 ? (
            <OhInlineEmpty>{t("listEmpty")}</OhInlineEmpty>
          ) : (
            <ul
              role="list"
              aria-labelledby="workspaces-legend"
              className="flex flex-col gap-2.5"
            >
              {data.map((w) => (
                <li key={w.id}>
                  <WorkspaceRow
                    slug={w.slug}
                    name={w.name}
                    role={w.role}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </OhPageShell>
  );
}

function WorkspaceRow({
  slug,
  name,
  role,
}: {
  slug: string;
  name: string;
  role: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
}) {
  const t = useTranslations("Workspaces");
  return (
    <Link
      href={`/workspaces/${slug}/members`}
      className="group flex items-center justify-between gap-3 rounded-(--oh-r-sm) border-[1.5px] border-oh-line bg-oh-bg p-4 transition-colors duration-150 ease-bru hover:border-oh-line-strong"
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="oh-eyebrow tabular-nums">{t(`role_${role}`)}</span>
        <h3 className="text-[16px] leading-[1.2] font-black truncate">{name}</h3>
        <span className="oh-eyebrow normal-case tracking-[1.5px] text-[11px]">
          /{slug}
        </span>
      </div>
      <ArrowRightIcon
        className="size-4 shrink-0 opacity-40 transition-opacity duration-150 ease-bru group-hover:opacity-100"
        aria-hidden
      />
    </Link>
  );
}
