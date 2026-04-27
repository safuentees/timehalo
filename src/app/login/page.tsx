import { signIn } from "@/auth";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import CredentialsForm from "./credentials-form";
import MagicLinkForm from "./magic-link-form";

export default function LoginPage() {
  return (
    <div className="h-screen overflow-hidden bg-background">
      <main className="mx-auto max-w-sm px-8 pt-16 sm:pt-32">
        <header className="mb-8">
          <h1 className="font-heading text-3xl font-normal italic tracking-tight text-foreground leading-none -ml-0.5">
            Sign in
          </h1>
          <p className="mt-4 font-mono text-xs tracking-wide text-muted-foreground text-pretty">
            Sign in to create and manage posts.
          </p>
        </header>

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
              await signIn("github", { redirectTo: "/" });
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
