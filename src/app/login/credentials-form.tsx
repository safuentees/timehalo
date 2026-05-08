"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence } from "motion/react";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/trpc/hooks";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";

export default function CredentialsForm() {
  const t = useTranslations("Auth");
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordField, setShowPasswordField] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const checkAccount = trpc.auth.checkAccountForLogin.useMutation();

  const sendMagicLink = async (toEmail: string) => {
    const res = await signIn("magic-link", {
      email: toEmail,
      redirect: false,
    });
    if (res?.error) {
      toast.error(t("magicLinkError"));
      return false;
    }
    toast.success(t("magicLinkSent", { email: toEmail }));
    return true;
  };

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;

    setIsSubmitting(true);
    try {
      if (!showPasswordField) {
        const result = await checkAccount.mutateAsync({ email: trimmed });

        if (!result.accountExists) {
          toast.error(t("errorAccountNotFound"));
          return;
        }

        if (result.hasPassword) {
          setShowPasswordField(true);
          return;
        }

        await sendMagicLink(trimmed);
        return;
      }

      if (password) {
        const res = await signIn("credentials", {
          email: trimmed,
          password,
          redirect: false,
        });
        if (res?.error) {
          toast.error(t("errorInvalidCredentials"));
          return;
        }
        router.push("/bookings");
        return;
      }

      await sendMagicLink(trimmed);
    } finally {
      setIsSubmitting(false);
    }
  };

  const buttonLabel = (() => {
    if (isSubmitting) return t("submitSignInPending");
    if (!showPasswordField) return t("submitContinueWithEmail");
    if (password) return t("submitSignInWithPassword");
    return t("submitSendMagicLink");
  })();

  return (
    <form onSubmit={onSubmit} className="flex flex-col">
      <div className="grid gap-2">
        <label htmlFor="login-email" className="oh-legend">
          {t("fieldEmail")}
        </label>
        <input
          id="login-email"
          type="email"
          required
          placeholder={t("fieldEmailPlaceholder")}
          autoComplete="email"
          className="oh-input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={showPasswordField || isSubmitting}
        />
      </div>

      <AnimatePresence initial={false}>
        {showPasswordField && (
          <motion.div
            key="password-field"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", duration: 0.3, bounce: 0 }}
            className="overflow-hidden"
          >
            <div className="grid gap-2 pt-5">
              <div className="flex items-baseline justify-between">
                <label htmlFor="login-password" className="oh-legend">
                  {t("fieldPassword")}
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setShowPasswordField(false);
                    setPassword("");
                  }}
                  className="oh-eyebrow opacity-55 transition-opacity hover:opacity-100"
                >
                  {t("useDifferentEmail")}
                </button>
              </div>
              <InputGroup className="!h-[43px] overflow-hidden rounded-(--oh-r-xs) !border-0 bg-[color:var(--oh-paper)]! [box-shadow:var(--oh-input-shadow-rest)] transition-[background-color,box-shadow] duration-150 ease-oh focus-within:bg-[var(--oh-input-bg-focus)]! has-[[data-slot=input-group-control]:focus-visible]:ring-0 has-[[data-slot=input-group-control]:focus-visible]:[box-shadow:var(--oh-focus-shadow-input)]">
                <InputGroupInput
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  placeholder={t("passwordOptionalPlaceholder")}
                  autoComplete="current-password"
                  autoFocus
                  className="h-full !bg-transparent px-4 py-2.5 text-[15px] text-[color:var(--oh-ink)] placeholder:text-[color:var(--oh-placeholder)] focus-visible:[box-shadow:none]!"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <InputGroupAddon align="inline-end" className="!bg-transparent pr-3">
                  <InputGroupButton
                    type="button"
                    size="icon-xs"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={
                      showPassword ? t("hidePassword") : t("showPassword")
                    }
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
              <p className="mt-1 text-[12px] leading-[1.5] opacity-55">
                {t("passwordOptionalHint")}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Button
        type="submit"
        variant="oh"
        size="oh"
        className="mt-5 w-full justify-center"
        disabled={isSubmitting}
      >
        {buttonLabel}
      </Button>
    </form>
  );
}
