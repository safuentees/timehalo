import {
  ErrorShell,
  ErrorShellLink,
} from "@/components/brutalist/error-shell";

export default function NotFound() {
  return (
    <ErrorShell
      label="Officehours / 404"
      title="Page not found."
      description="The link you followed has rotted, or never existed. Three places to land instead:"
    >
      <ErrorShellLink
        href="/"
        title="Home"
        description="Start here"
      />
      <ErrorShellLink
        href="/login"
        title="Sign in"
        description="If you have an account"
      />
      <ErrorShellLink
        href="/register"
        title="Create an account"
        description="If you don't"
      />
    </ErrorShell>
  );
}
