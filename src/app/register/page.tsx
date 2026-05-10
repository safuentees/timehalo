import type { Metadata } from "next";
import { OhAuthShell } from "@/components/oh/oh-auth-shell";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = {
  title: "Create account — Officehours",
  description: "Claim your booking handle and start taking 1:1s.",
  robots: { index: false, follow: false },
};

export default function RegisterPage() {
  return (
    <OhAuthShell>
      <RegisterForm />
    </OhAuthShell>
  );
}
