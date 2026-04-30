import Link from "next/link";
import { signIn } from "@/auth";
import { Button } from "@/components/ui/button";
import { RegisterForm } from "./register-form";

// Register shell mirrors /login: paper-on-ink, ink-bordered card,
// `or` rule + GitHub button so a returning user with a GitHub
// identity has the same one-tap path on either side. Audit asked
// for parity (`§1.3 — Register has no GitHub option despite login
// offering GitHub`).
export default function RegisterPage() {
  return (
    <div className="min-h-screen bg-[color:var(--oh-frame)] text-[color:var(--oh-ink)]">
      <main className="mx-auto w-full max-w-[420px] px-5 pt-12 pb-16 sm:pt-24 sm:px-6">
        <header className="mb-7">
          <h1 className="text-[28px] font-bold tracking-tight leading-none">
            Create account
          </h1>
          <p className="mt-3 text-[13px] leading-[1.5] opacity-65">
            Pick a handle. It becomes your public URL.
          </p>
        </header>

        <RegisterForm />

        <div className="mt-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-oh-line" />
          <span className="oh-eyebrow">or</span>
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
            Continue with GitHub
          </Button>
        </form>

        <p className="mt-8 text-[13px] opacity-65">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-medium text-[color:var(--oh-ink)] underline underline-offset-4 decoration-oh-line transition-colors hover:decoration-[color:var(--oh-ink)]"
          >
            Sign in
          </Link>
        </p>
      </main>
    </div>
  );
}
