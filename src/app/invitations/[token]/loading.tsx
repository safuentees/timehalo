import { getTranslations } from "next-intl/server";

export default async function InvitationLoading() {
  const t = await getTranslations("Invitations");
  return (
    <div className="min-h-screen bg-oh-bg">
      <main className="mx-auto max-w-md px-6 pt-20 sm:pt-32">
        <header>
          <p className="oh-eyebrow opacity-30">{t("skeletonEyebrow")}</p>
          <SkeletonBar className="mt-4 h-9 w-3/4" />
          <SkeletonBar className="mt-5 h-3 w-full" />
          <SkeletonBar className="mt-2 h-3 w-5/6" />
        </header>

        <dl className="mt-8 flex flex-col gap-3 border-t-2 border-oh-line-strong pt-6">
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </dl>

        <div className="mt-8 flex flex-col gap-3">
          <SkeletonBar className="h-10 w-full" />
        </div>
      </main>
    </div>
  );
}

function SkeletonBar({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-(--oh-r-xs) bg-[color:var(--oh-tint)] ${className ?? ""}`}
    />
  );
}

function SkeletonRow() {
  return (
    <div className="flex items-baseline justify-between gap-x-4">
      <SkeletonBar className="h-3 w-16" />
      <SkeletonBar className="h-3 w-32" />
    </div>
  );
}
