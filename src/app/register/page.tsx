import Link from "next/link";
import { RegisterForm } from "./register-form";

export default function RegisterPage() {
  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-sm px-8 pt-16 sm:pt-32 pb-16">
        <header className="mb-8">
          <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground leading-none -ml-0.5">
            Create account
          </h1>
          <p className="mt-4 font-mono text-xs tracking-wide text-muted-foreground text-pretty">
            Pick a handle. It becomes your public URL.
          </p>
        </header>

        <RegisterForm />

        <p className="font-mono text-xs text-muted-foreground mt-8">
          Already have an account?{" "}
          <Link
            href="/login"
            className="text-foreground transition-colors duration-200 hover:text-muted-foreground"
          >
            Sign in
          </Link>
        </p>
      </main>
    </div>
  );
}
