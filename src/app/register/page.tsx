import type { Metadata } from "next";
import { OhAuthShell } from "@/components/oh/oh-auth-shell";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = {
  title: "Create account — Officehours",
  description: "Claim your booking handle and start taking 1:1s.",
  robots: { index: false, follow: false },
};

// dub.co `apps/web/app/app.dub.co/(auth)/register/page.tsx` pattern:
// the page is minimal chrome (auth shell only); the entire register
// flow — heading, signup form, OR/GitHub, sign-in link, verify view —
// lives in the client `<RegisterForm>`. This is what lets the
// per-step view-swap drop the signup-only chrome (heading + OR +
// GitHub + sign-in link) when the user advances to the OTP verify
// step, leaving just the centered verify cluster + form on screen
// (mirroring `RegisterFlow` → `<SignUp />` / `<Verify />` in
// `apps/web/app/app.dub.co/(auth)/register/page-client.tsx`).
export default function RegisterPage() {
  return (
    <OhAuthShell>
      <RegisterForm />
    </OhAuthShell>
  );
}
