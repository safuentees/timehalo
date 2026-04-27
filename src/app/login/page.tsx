import { signIn } from "@/auth";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import CredentialsForm from "./credentials-form";
import MagicLinkForm from "./magic-link-form";

// next-auth surfaces these via `?error=` when pages.error redirects
// here. Verification = expired or already-used magic-link token.
// AccessDenied = signIn callback returned false. Configuration =
// missing env / provider misconfig (operator-level, rare).
const ERROR_COPY: Record<string, string> = {
  Verification: "That sign-in link is expired or already used. Send a new one below.",
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
  const errorMessage = error ? (ERROR_COPY[error] ?? "Sign-in failed. Try again.") : null;

  return (
    <div className="h-screen overflow-hidden bg-background">
      <main className="mx-auto max-w-sm px-8 pt-16 sm:pt-32">
        <header className="mb-8">
          <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground leading-none -ml-0.5">
            Sign in
          </h1>
          <p className="mt-4 font-mono text-xs tracking-wide text-muted-foreground text-pretty">
            Sign in to create and manage posts.
          </p>
        </header>

        {errorMessage && (
          <div
            role="alert"
            className="mb-6 border-l-2 border-destructive bg-destructive/[0.06] px-3 py-2 font-mono text-xs leading-relaxed text-destructive"
          >
            {errorMessage}
          </div>
        )}

        <div className="pt-2 pb-8">
          <CredentialsForm />
        </div>

        <div className="flex items-center gap-3 w-full">
          <div className="flex-1 h-px bg-border" />
          <span className="font-mono text-xs text-muted-foreground uppercase tracking-widest">
            or
          </span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <div className="pt-6">
          <form
            action={async () => {
              "use server";
              await signIn("github", { redirectTo: "/bookings" });
            }}
          >
            <Button
              type="submit"
              variant="outline"
              size="sm"
              className="w-full font-mono text-xs tracking-wide border-foreground/20 transition-colors duration-200 hover:bg-foreground/[0.06] hover:border-foreground/40"
            >
              <img
                src="/icons/github.svg"
                alt=""
                className="size-3.5 dark:invert"
              />
              Continue with GitHub
            </Button>
          </form>
        </div>

        <div className="pt-6">
          <MagicLinkForm />
        </div>

        <p className="font-mono text-xs text-muted-foreground mt-8">
          No account?{" "}
          <Link
            href="/register"
            className="text-foreground transition-colors duration-200 hover:text-muted-foreground"
          >
            Sign up
          </Link>
        </p>
      </main>
    </div>
  );
}
