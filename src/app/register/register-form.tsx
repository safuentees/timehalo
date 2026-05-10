"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { registerInputSchema } from "@/lib/register-schema";
import { useRegister } from "@/lib/mutations/use-register";

type Form = {
  email: string;
  password: string;
};

export function RegisterForm() {
  const t = useTranslations("Auth");
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const {
    register: registerField,
    handleSubmit,
    setError,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<Form>({
    defaultValues: { email: "", password: "" },
    resolver: zodResolver(registerInputSchema),
    mode: "onBlur",
  });

  const registerMutation = useRegister({
    onSuccess: async (created, variables) => {
      const result = await signIn("credentials", {
        email: created.email,
        password: variables.password,
        redirect: false,
      });

      if (result?.error) {
        setError("root", {
          message: t("errorAccountCreatedSignInFailed"),
        });
        return;
      }

      router.push("/bookings");
      router.refresh();
    },
    onError: (error) => {
      if (error.data?.code !== "CONFLICT") return;
      setError("email", { message: error.message });
      setFocus("email");
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await registerMutation.mutateAsync(values);
    } catch {
    }
  });

  const isBusy = isSubmitting || registerMutation.isPending;

  return (
    <form onSubmit={onSubmit} className="grid gap-5">
      <div className="grid gap-2">
        <label htmlFor="register-email" className="oh-legend">
          {t("fieldEmail")}
        </label>
        <input
          id="register-email"
          type="email"
          placeholder={t("registerEmailPlaceholder")}
          autoComplete="email"
          aria-invalid={errors.email ? true : undefined}
          {...registerField("email")}
          className="oh-input"
        />
        {errors.email ? (
          <p className="oh-field-error text-[12px] text-[color:var(--destructive)]">
            {errors.email.message}
          </p>
        ) : null}
      </div>

      <div className="grid gap-2">
        <label htmlFor="register-password" className="oh-legend">
          {t("fieldPassword")}
        </label>
        <InputGroup>
          <InputGroupInput
            id="register-password"
            type={showPassword ? "text" : "password"}
            placeholder={t("registerPasswordPlaceholder")}
            autoComplete="new-password"
            aria-invalid={errors.password ? true : undefined}
            {...registerField("password")}
          />
          <InputGroupAddon align="inline-end" className="!bg-transparent pr-3">
            <InputGroupButton
              type="button"
              size="icon-xs"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? t("hidePassword") : t("showPassword")}
              aria-pressed={showPassword}
              className="!bg-transparent !shadow-none !ring-0 hover:!bg-transparent text-[color:var(--oh-ink)] [&_svg]:opacity-55 [&_svg]:transition-opacity [&_svg]:duration-150 hover:[&_svg]:opacity-100"
            >
              {showPassword ? (
                <EyeOff className="size-4" strokeWidth={1.75} />
              ) : (
                <Eye className="size-4" strokeWidth={1.75} />
              )}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        {errors.password ? (
          <p className="oh-field-error text-[12px] text-[color:var(--destructive)]">
            {errors.password.message}
          </p>
        ) : null}
      </div>

      {errors.root?.message ? (
        <p className="oh-field-error text-[12px] text-[color:var(--destructive)]">
          {errors.root.message}
        </p>
      ) : null}

      <Button
        type="submit"
        variant="oh"
        size="oh"
        disabled={isBusy}
        className="w-full justify-center"
      >
        {isBusy ? t("submitCreateAccountPending") : t("submitCreateAccount")}
      </Button>
    </form>
  );
}
