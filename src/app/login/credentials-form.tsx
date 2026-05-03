"use client";

import { signIn } from "next-auth/react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";

type LoginForm = {
  email: string;
  password: string;
};

// Native `<input>` + `oh-input` class for the email row; the password
// row composes shadcn's InputGroup primitive with an inline-end addon
// so the eye toggle sits inside the field's border (cal.com /
// `login-view.tsx:274-291` pattern). Keep `name="email"` /
// `name="password"` and the button text `"Sign in"` exact — the
// Playwright auth setup at `e2e/auth.setup.ts` selects on those.
//
// Redirect: send the user straight to `/bookings`. The previous
// `/` push triggered a second redirect through the index route on
// slow connections, which read as a flash of the marketing surface.
export default function CredentialsForm() {
  const t = useTranslations("Auth");
  const router = useRouter();
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<LoginForm>();

  const onSubmit = async (data: LoginForm) => {
    setError("");
    const res = await signIn("credentials", {
      email: data.email,
      password: data.password,
      redirect: false,
    });

    if (res?.error) {
      setError(t("errorInvalidCredentials"));
    } else {
      router.push("/bookings");
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-5">
      <div className="grid gap-2">
        <label htmlFor="login-email" className="oh-legend">
          {t("fieldEmail")}
        </label>
        <input
          id="login-email"
          type="email"
          placeholder={t("fieldEmailPlaceholder")}
          autoComplete="email"
          className="oh-input"
          {...register("email")}
        />
      </div>

      <div className="grid gap-2">
        <label htmlFor="login-password" className="oh-legend">
          {t("fieldPassword")}
        </label>
        {/* Wrapper mirrors `.oh-input`'s tiered interaction states so
            the password row matches the email row above:
              rest   → 1.5px ink edge + paper bg
              hover  → +4% bg lift (signals interactivity)
              focus  → +8% bg lift + `--oh-focus-shadow-input`
                       (inset 1px ink that visually thickens the
                       border 1.5 → 2.5px, plus paper halo + soft
                       outer ring)
            Height pinned to 46px to override shadcn's hardcoded h-8
            (also on the inner Input — see `h-full` below).
            Inner `<Input>`'s own `oh-focus-ring` shadow is killed
            via `focus-visible:[box-shadow:none]!` so the focus signal
            paints once on the WRAPPER, never inside the bordered
            field. shadcn's InputGroup is designed for this "wrapper
            owns the focus" pattern; we just route it through our
            tokens instead of `--ring`. */}
        <InputGroup className="h-[46px] overflow-hidden rounded-(--oh-r-xs) border-[1.5px] border-[color:var(--oh-ink)] bg-[color:var(--oh-paper)] transition-[background-color,box-shadow] duration-150 ease-oh hover:not-focus-within:bg-[var(--oh-input-bg-hover)] focus-within:bg-[var(--oh-input-bg-focus)] focus-within:[box-shadow:var(--oh-focus-shadow-input)]">
          <InputGroupInput
            id="login-password"
            type={showPassword ? "text" : "password"}
            placeholder={t("fieldPasswordPlaceholder")}
            autoComplete="current-password"
            className="h-full bg-transparent px-3 py-2.5 text-[15px] text-[color:var(--oh-ink)] placeholder:text-[color:var(--oh-placeholder)] focus-visible:[box-shadow:none]!"
            {...register("password")}
          />
          <InputGroupAddon align="inline-end" className="bg-transparent pr-2">
            <InputGroupButton
              type="button"
              size="icon-xs"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? t("hidePassword") : t("showPassword")}
              aria-pressed={showPassword}
              className="text-[color:var(--oh-ink)] [&_svg]:opacity-[0.55] [&_svg]:transition-opacity [&_svg]:duration-150 hover:[&_svg]:opacity-100 hover:bg-[color:var(--oh-tint-hover)]"
            >
              {showPassword ? (
                <EyeOff className="size-4" strokeWidth={1.75} />
              ) : (
                <Eye className="size-4" strokeWidth={1.75} />
              )}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </div>

      {error ? (
        <p className="oh-field-error text-[12px] text-[color:var(--destructive)]">
          {error}
        </p>
      ) : null}

      <Button
        type="submit"
        variant="oh"
        size="oh"
        className="w-full justify-center"
        disabled={isSubmitting}
      >
        {isSubmitting ? t("submitSignInPending") : t("submitSignIn")}
      </Button>
    </form>
  );
}
