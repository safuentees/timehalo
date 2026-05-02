import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { signIn } from "@/auth";
import { Button } from "@/components/ui/button";
import { RegisterForm } from "./register-form";

export default async function RegisterPage() {
  const t = await getTranslations("Auth");
  return (
    <div className="min-h-screen bg-[color:var(--oh-frame)] text-[color:var(--oh-ink)]">
      <main className="mx-auto w-full max-w-[420px] px-5 pt-12 pb-16 sm:pt-24 sm:px-6">
        <header className="mb-7">
          <h1 className="text-[28px] font-bold tracking-tight leading-none">
            {t("registerTitle")}
          </h1>
          <p className="mt-3 text-[13px] leading-[1.5] opacity-65">
            {t("registerSubtitle")}
          </p>
        </header>

        <RegisterForm />

        <div className="mt-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-oh-line" />
          <span className="oh-eyebrow">{t("or")}</span>
          <div className="h-px flex-1 bg-oh-line" />
        </div>

        <form
          action={async () => {
            "use server";
            await signIn("github", { redirectTo: "/bookings" });
          }}
          className="mt-6"
        >
          <Button
            type="submit"
            variant="ohGhost"
            size="oh"
            className="w-full justify-center gap-2"
          >
            <img src="/icons/github.svg" alt="" className="size-4 dark:invert" />
            {t("continueWithGithub")}
          </Button>
        </form>

        <p className="mt-8 text-[13px] opacity-65">
          {t("registerHaveAccount")}{" "}
          <Link
            href="/login"
            className="font-medium text-[color:var(--oh-ink)] underline underline-offset-4 decoration-oh-line transition-colors hover:decoration-[color:var(--oh-ink)]"
          >
            {t("registerSignIn")}
          </Link>
        </p>
      </main>
    </div>
  );
}
