import { getTranslations } from "next-intl/server";
import { signIn } from "@/auth";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import CredentialsForm from "./credentials-form";
import MagicLinkForm from "./magic-link-form";

type SearchParams = Promise<{ error?: string }>;

// Auth shell: paper-on-ink palette via oh tokens, no `h-screen
// overflow-hidden` (mobile soft-keyboard would clip the form).
// No bordered card around the form — dub.co's auth pages render the
// form directly on the page bg (`apps/web/app/app.dub.co/(auth)/
// layout.tsx` — Toolbar + Grid bg + form column with no surrounding
// container). Cal.com's card uses `bg-default` which IS the page bg,
// so even there the card reads as a thickened page area, not a
// popping container. Inputs carry their own oh-input border + paper
// fill, so the form has plenty of structure without a wrapping shell.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { error } = await searchParams;
  // B.PT26 — server-rendered page, so use `getTranslations` (the
  // server-side counterpart to `useTranslations`). Error keys come
  // from next-auth's `?error=...` redirect; map each known key to a
  // namespaced message so locale-aware copy reaches the user.
  // Operator-level errors (Configuration, OAuthSignin/Callback) and
  // unknown values fall through to a generic key.
  const t = await getTranslations("Auth");
  const errorMessageKey = (() => {
    if (!error) return null;
    if (error === "Verification") return "errorVerification";
    if (error === "AccessDenied") return "errorAccessDenied";
    if (error === "Configuration") return "errorConfiguration";
    if (error === "OAuthSignin") return "errorOAuthSignin";
    if (error === "OAuthCallback") return "errorOAuthCallback";
    return "errorGeneric";
  })();
  const errorMessage = errorMessageKey ? t(errorMessageKey) : null;

  return (
    <div className="min-h-screen bg-[color:var(--oh-frame)] text-[color:var(--oh-ink)]">
      <main className="mx-auto w-full max-w-[420px] px-5 pt-12 pb-16 sm:pt-24 sm:px-6">
        <header className="mb-7">
          <h1 className="text-[28px] font-bold tracking-tight leading-none">
            {t("loginTitle")}
          </h1>
          <p className="mt-3 text-[13px] leading-[1.5] opacity-65">
            {t("loginSubtitle")}
          </p>
        </header>

        {errorMessage ? (
          <div
            role="alert"
            className="oh-field-error mb-6 border-l-2 border-[color:var(--destructive)] bg-[color:color-mix(in_srgb,var(--destructive)_8%,transparent)] px-3 py-2 text-[12px] leading-relaxed text-[color:var(--destructive)]"
          >
            {errorMessage}
          </div>
        ) : null}

        <CredentialsForm />

        <div className="mt-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-oh-line" />
          <span className="oh-eyebrow">{t("or")}</span>
          <div className="h-px flex-1 bg-oh-line" />
        </div>

        <div className="mt-6 grid gap-3">
          <form
            action={async () => {
              "use server";
              await signIn("github", { redirectTo: "/bookings" });
            }}
          >
            <Button
              type="submit"
              variant="ohGhost"
              size="oh"
              className="w-full justify-center gap-2"
            >
              <img
                src="/icons/github.svg"
                alt=""
                className="size-4 dark:invert"
              />
              {t("continueWithGithub")}
            </Button>
          </form>
          <MagicLinkForm />
        </div>

        <p className="mt-8 text-[13px] opacity-65">
          {t("loginNoAccount")}{" "}
          <Link
            href="/register"
            className="font-medium text-[color:var(--oh-ink)] underline underline-offset-4 decoration-oh-line transition-colors hover:decoration-[color:var(--oh-ink)]"
          >
            {t("loginCreateAccount")}
          </Link>
        </p>
      </main>
    </div>
  );
}
