import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { GuestStartButton } from "@/components/auth/guest-start-button";
import { buttonVariants } from "@/components/ui/button";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Landing");
  return { title: t("pageTitle"), description: t("pageDescription") };
}

export default async function LandingPage() {
  const t = await getTranslations("Landing");
  return (
    <div className="oh-visitor-shell flex h-dvh flex-col bg-oh-bg text-oh-ink">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-oh-line px-6 py-5 sm:px-10">
        <Link href="/" className="oh-focus-ring flex items-center gap-3 rounded-sm text-lg font-bold">
          <Image src="/favicon.svg" alt="" aria-hidden width={24} height={24} className="size-6 dark:invert" />
          {t("brand")}
        </Link>
        <nav aria-label={t("navLabel")}>
          <Link href="/login" className={buttonVariants({ variant: "ohGhost", size: "oh" })}>
            {t("signIn")}
          </Link>
        </nav>
      </header>

      <main className="flex min-h-0 flex-1 items-center justify-center px-6 sm:px-10">
        <section aria-labelledby="landing-title" className="w-full max-w-2xl py-6 text-center">
          <p className="oh-legend mb-4">{t("eyebrow")}</p>
          <h1 id="landing-title" className="text-oh-h1 font-bold text-balance">
            {t("headline")}
          </h1>
          <p className="mx-auto mt-5 max-w-md text-oh-body text-pretty text-oh-content-muted">
            {t("intro")}
          </p>

          <div className="mt-7 flex justify-center">
              <GuestStartButton />
          </div>
          <p className="mt-4 text-oh-sub text-oh-content-muted text-pretty">{t("demoHint")}</p>
        </section>
      </main>

      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-oh-line px-6 py-4 text-oh-sub text-oh-content-muted sm:px-10">
        <p>{t("footerLine")}</p>
        <Link href="https://github.com/safuentees/timehalo" className="oh-focus-ring rounded-sm underline decoration-oh-line underline-offset-4 hover:text-oh-ink">
          {t("viewSource")}
        </Link>
      </footer>
    </div>
  );
}
