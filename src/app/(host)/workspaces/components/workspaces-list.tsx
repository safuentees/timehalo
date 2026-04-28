"use client";

import { Link } from "next-view-transitions";
import { useTranslations } from "next-intl";
import { ArrowRightIcon } from "lucide-react";
import { trpc } from "@/trpc/hooks";
import { BrutalistInlineEmpty } from "@/components/brutalist/inline-empty";
import { BrutalistPageHeader } from "@/components/brutalist/page-header";
import { BrutalistPageShell } from "@/components/brutalist/page-shell";
import { WorkspaceCreateDialog } from "./workspace-create-dialog";

export default function WorkspacesList() {
  const t = useTranslations("Workspaces");
  const { data, isLoading } = trpc.workspaces.list.useQuery();

  return (
    <BrutalistPageShell>
      <BrutalistPageHeader title={t("title")} />

      <section
        aria-labelledby="workspaces-legend"
        className="mt-8"
      >
        <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <div className="min-w-0 flex-1">
            <p id="workspaces-legend" className="bru-legend">
              {t("legend")}
            </p>
            <p className="bru-description mt-3">{t("description")}</p>
          </div>
          <div className="shrink-0 self-start">
            <WorkspaceCreateDialog />
          </div>
        </header>

        <div className="mt-5">
          {isLoading ? (
            <p className="text-[13px] opacity-55">{t("loading")}</p>
          ) : !data || data.length === 0 ? (
            <BrutalistInlineEmpty>{t("listEmpty")}</BrutalistInlineEmpty>
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
    </BrutalistPageShell>
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
      className="group flex items-center justify-between gap-3 rounded-(--bru-r-sm) border-[1.5px] border-bru-line bg-bru-bg p-4 transition-colors duration-150 ease-bru hover:border-bru-line-strong"
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="font-[family-name:var(--bru-mono)] text-[10px] font-extrabold tracking-[2.2px] uppercase opacity-55">
          {t(`role_${role}`)}
        </span>
        <h3 className="text-[16px] leading-[1.2] font-black truncate">{name}</h3>
        <span className="font-[family-name:var(--bru-mono)] text-[11px] tracking-[1.5px] opacity-55">
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
