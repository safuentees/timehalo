import { signIn } from "@/auth";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import CredentialsForm from "./credentials-form";
import MagicLinkForm from "./magic-link-form";

const ERROR_COPY: Record<string, string> = {
  Verification:
    "That sign-in link is expired or already used. Send a new one below.",
  AccessDenied: "Access denied for that account.",
  Configuration: "Sign-in is temporarily unavailable. Try again shortly.",
  OAuthSignin: "Could not start the OAuth flow. Try again.",
  OAuthCallback: "OAuth provider returned an error. Try again.",
};

type SearchParams = Promise<{ error?: string }>;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { error } = await searchParams;
  const errorMessage = error
    ? (ERROR_COPY[error] ?? "Sign-in failed. Try again.")
    : null;

  return (
    <div className="min-h-screen bg-[color:var(--oh-frame)] text-[color:var(--oh-ink)]">
      <main className="mx-auto w-full max-w-[420px] px-5 pt-12 pb-16 sm:pt-24 sm:px-6">
        <header className="mb-7">
          <h1 className="text-[28px] font-bold tracking-tight leading-none">
            Sign in
          </h1>
          <p className="mt-3 text-[13px] leading-[1.5] opacity-65">
            Welcome back. Pick how you want to get in.
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
          <span className="oh-eyebrow">or</span>
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
              Continue with GitHub
            </Button>
          </form>
          <MagicLinkForm />
        </div>

        <p className="mt-8 text-[13px] opacity-65">
          New here?{" "}
          <Link
            href="/register"
            className="font-medium text-[color:var(--oh-ink)] underline underline-offset-4 decoration-oh-line transition-colors hover:decoration-[color:var(--oh-ink)]"
          >
            Create an account
          </Link>
        </p>
      </main>
    </div>
  );
}
