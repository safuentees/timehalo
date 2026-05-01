"use client";

import type { inferRouterOutputs } from "@trpc/server";
import { ArrowLeftIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import HostProfile from "@/app/h/[handle]/components/host-profile";
import type { AppRouter } from "@/trpc/router";

type RouterOutputs = inferRouterOutputs<AppRouter>;

type Props = {
  handle: string;
  initialUser: RouterOutputs["users"]["getByHandle"];
  initialSlots: RouterOutputs["schedule"]["getUpcomingSlots"];
  renderedAt: string;
};

export default function PreviewShell({
  handle,
  initialUser,
  initialSlots,
  renderedAt,
}: Props) {
  const router = useRouter();
  const t = useTranslations("HostPreview");

  return (
    <>
      <button
        type="button"
        onClick={() => router.back()}
        className="oh-preview-exit"
        aria-label={t("exit")}
      >
        <ArrowLeftIcon
          aria-hidden
          strokeWidth={1.75}
          className="oh-preview-exit-icon"
        />
        <span className="oh-eyebrow opacity-100">{t("exitLabel")}</span>
      </button>

      <HostProfile
        handle={handle}
        initialUser={initialUser}
        initialSlots={initialSlots}
        renderedAt={renderedAt}
      />
    </>
  );
}
