import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { signIn } from "@/auth";
import { Button } from "@/components/ui/button";
import { OhAuthShell } from "@/components/oh/oh-auth-shell";
import { RegisterForm } from "./register-form";

// Register shell consumer (B.PT108) — mirror of /login. Drops the
// inline `min-h-screen` div + bespoke `pt-12 pb-16` main wrapper for
// the OhAuthShell viewport-fill + max-w-420 width vocabulary.
// `or` rule + GitHub button kept verbatim so a returning user with a
// GitHub identity has the same one-tap path on either side. Audit
// asked for parity (`§1.3 — Register has no GitHub option despite
// login offering GitHub`). B.PT26 — copy localized via `Auth`
// namespace keys.
export default async function RegisterPage() {
  const t = await getTranslations("Auth");
  return (
    <OhAuthShell>
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
          className="w-full justify-center gap-2 bg-[color:var(--oh-paper)]! text-[color:var(--oh-ink)]! hover:bg-[color:var(--oh-paper)]! hover:text-[color:var(--oh-ink)]!"
        >
          <img src="/icons/github.svg" alt="" className="size-4 dark:invert" />
          {t("continueWithGithub")}
        </Button>
      </form>

      <p className="mt-8 text-[13px] opacity-65">
        {t("registerHaveAccount")}{" "}
        <Link
          href="/login"
          className="oh-focus-ring rounded-(--oh-r-xs) -mx-1 px-1 font-medium text-[color:var(--oh-ink)] underline underline-offset-4 decoration-oh-line transition-colors hover:decoration-[color:var(--oh-ink)]"
        >
          {t("registerSignIn")}
        </Link>
      </p>
    </OhAuthShell>
  );
}
