"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Controller, useForm } from "react-hook-form";
import { motion, AnimatePresence } from "motion/react";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GithubMark } from "@/components/oh/github-mark";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { registerInputSchema } from "@/lib/register-schema";
import { OTP_CODE_LENGTH, OTP_RESEND_COOLDOWN_SECONDS } from "@/lib/otp";
import { useSendRegisterOtp } from "@/lib/mutations/use-send-register-otp";
import { useVerifyRegisterOtp } from "@/lib/mutations/use-verify-register-otp";

type CredentialsForm = {
  email: string;
  password: string;
};

type Step = "credentials" | "verify";

type Phase = "idle" | "sending-code" | "verifying" | "redirecting";

export function RegisterForm() {
  const t = useTranslations("Auth");
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [step, setStep] = useState<Step>("credentials");
  const [phase, setPhase] = useState<Phase>("idle");
  const [resendCountdown, setResendCountdown] = useState(0);
  const [otp, setOtp] = useState("");
  const [otpError, setOtpError] = useState<string | null>(null);
  const [pending, setPending] = useState<CredentialsForm | null>(null);

  const form = useForm<CredentialsForm>({
    defaultValues: { email: "", password: "" },
    resolver: zodResolver(registerInputSchema),
    mode: "onBlur",
  });

  const sendOtp = useSendRegisterOtp({
    onSuccess: (_data, variables) => {
      setPending(variables);
      setStep("verify");
      setResendCountdown(OTP_RESEND_COOLDOWN_SECONDS);
      setPhase("idle");
    },
    onError: (error) => {
      setPhase("idle");
      if (error.data?.code === "CONFLICT") {
        form.setError("email", { message: error.message });
        form.setFocus("email");
      }
    },
  });

  const verifyOtp = useVerifyRegisterOtp({
    onSuccess: async () => {
      if (!pending) return;
      setPhase("redirecting");
      const result = await signIn("credentials", {
        email: pending.email,
        password: pending.password,
        redirect: false,
      });
      if (result?.error) {
        setPhase("idle");
        setOtpError(t("errorAccountCreatedSignInFailed"));
        return;
      }
      router.push("/bookings");
      router.refresh();
    },
    onError: (error) => {
      setPhase("idle");
      const code = error.data?.code;
      if (code === "BAD_REQUEST" || code === "TOO_MANY_REQUESTS") {
        setOtpError(error.message);
        setOtp("");
      }
    },
  });

  useEffect(() => {
    if (resendCountdown <= 0) return;
    const id = window.setTimeout(() => {
      setResendCountdown((s) => Math.max(0, s - 1));
    }, 1000);
    return () => window.clearTimeout(id);
  }, [resendCountdown]);

  const submitCredentials = form.handleSubmit(async (values) => {
    setPhase("sending-code");
    try {
      await sendOtp.mutateAsync(values);
    } catch {
    }
  });

  function submitVerify() {
    if (!pending || otp.length !== OTP_CODE_LENGTH) return;
    setOtpError(null);
    setPhase("verifying");
    verifyOtp.mutate({ ...pending, code: otp });
  }

  function resend() {
    if (!pending || resendCountdown > 0) return;
    setOtp("");
    setOtpError(null);
    setPhase("sending-code");
    sendOtp.mutate(pending);
  }

  function backToCredentials() {
    setStep("credentials");
    setOtp("");
    setOtpError(null);
    setPhase("idle");
  }

  const isBusy = phase !== "idle";
  const submitCredentialsLabel =
    phase === "sending-code"
      ? t("submitCreateAccountSending")
      : t("submitCreateAccountContinue");
  const verifyStatus =
    phase === "verifying"
      ? t("submitVerifyOtpPending")
      : phase === "redirecting"
        ? t("submitCreateAccountRedirecting")
        : null;

  return (
    <AnimatePresence mode="wait" initial={false}>
      {step === "credentials" ? (
        <motion.div
          key="credentials"
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -8 }}
          transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
        >
          <header className="mb-7">
            <h1 className="text-[28px] font-bold tracking-tight leading-none">
              {t("registerTitle")}
            </h1>
            <p className="mt-3 text-[13px] leading-[1.5] opacity-65">
              {t("registerSubtitle")}
            </p>
          </header>

          <form onSubmit={submitCredentials} className="grid gap-5">
            <div className="grid gap-2">
              <label htmlFor="register-email" className="oh-legend">
                {t("fieldEmail")}
              </label>
              <input
                id="register-email"
                type="email"
                placeholder={t("registerEmailPlaceholder")}
                autoComplete="email"
                aria-invalid={form.formState.errors.email ? true : undefined}
                {...form.register("email")}
                className="oh-input"
              />
              {form.formState.errors.email ? (
                <p className="oh-field-error text-[12px] text-[color:var(--destructive)]">
                  {form.formState.errors.email.message}
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
                  aria-invalid={
                    form.formState.errors.password ? true : undefined
                  }
                  {...form.register("password")}
                />
                <InputGroupAddon
                  align="inline-end"
                  className="!bg-transparent pr-3"
                >
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
              {form.formState.errors.password ? (
                <p className="oh-field-error text-[12px] text-[color:var(--destructive)]">
                  {form.formState.errors.password.message}
                </p>
              ) : null}
            </div>

            {form.formState.errors.root?.message ? (
              <p className="oh-field-error text-[12px] text-[color:var(--destructive)]">
                {form.formState.errors.root.message}
              </p>
            ) : null}

            <Button
              type="submit"
              variant="oh"
              size="oh"
              disabled={isBusy}
              className="w-full justify-center"
            >
              {submitCredentialsLabel}
            </Button>
          </form>

          <div className="mt-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-oh-line" />
            <span className="oh-eyebrow">{t("or")}</span>
            <div className="h-px flex-1 bg-oh-line" />
          </div>

          <div className="mt-6">
            <Button
              type="button"
              variant="ohGhost"
              size="oh"
              onClick={() =>
                signIn("github", { callbackUrl: "/bookings" })
              }
              disabled={isBusy}
              className="w-full justify-center gap-2 bg-[color:var(--oh-paper)]! text-[color:var(--oh-ink)]! hover:bg-[color:var(--oh-paper)]! hover:text-[color:var(--oh-ink)]!"
            >
              <GithubMark />
              {t("continueWithGithub")}
            </Button>
          </div>

          <p className="mt-8 text-[13px] opacity-65">
            {t("registerHaveAccount")}{" "}
            <Link
              href="/login"
              className="oh-focus-ring rounded-(--oh-r-xs) -mx-1 px-1 font-medium text-[color:var(--oh-ink)] underline underline-offset-4 decoration-oh-line transition-colors hover:decoration-[color:var(--oh-ink)]"
            >
              {t("registerSignIn")}
            </Link>
          </p>
        </motion.div>
      ) : (
        <motion.div
          key="verify"
          initial={{ opacity: 0, x: 8 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 8 }}
          transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
          className="flex flex-col"
        >
          <button
            type="button"
            onClick={backToCredentials}
            aria-label={t("verifyOtpBackAriaLabel")}
            className="oh-focus-ring -ml-2 mb-6 inline-flex size-8 shrink-0 items-center justify-center self-start rounded-(--oh-r-xs) text-[color:var(--oh-ink)] opacity-55 transition-[opacity,background-color] duration-150 ease-oh hover:bg-[var(--oh-tint-hover)] hover:opacity-100 focus-visible:opacity-100"
          >
            <ArrowLeft strokeWidth={1.75} className="size-4" aria-hidden />
          </button>

          <div className="flex flex-col items-center gap-1 text-center">
            <h2 className="text-[20px] font-semibold leading-tight">
              {t("verifyOtpHeading")}
            </h2>
            <p className="text-[14px] font-medium leading-[1.5] opacity-65">
              {t.rich("verifyOtpDescription", {
                email: truncateEmail(pending?.email ?? ""),
                bold: (chunks) => (
                  <span className="font-semibold opacity-100">{chunks}</span>
                ),
              })}
            </p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitVerify();
            }}
            className="mt-12 grid gap-3"
          >
            <Controller
              name="email"
              control={form.control}
              render={() => (
                <InputOTP
                  id="register-otp"
                  value={otp}
                  onChange={(next) => {
                    setOtp(next);
                    if (otpError) setOtpError(null);
                  }}
                  maxLength={OTP_CODE_LENGTH}
                  onComplete={() => submitVerify()}
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  pattern="^[0-9]*$"
                  placeholder={"0".repeat(OTP_CODE_LENGTH)}
                  disabled={isBusy}
                  aria-invalid={otpError ? true : undefined}
                  aria-label={t("verifyOtpAriaLabel")}
                >
                  <InputOTPGroup>
                    {Array.from({ length: OTP_CODE_LENGTH }).map(
                      (_, idx) => (
                        <InputOTPSlot
                          key={idx}
                          index={idx}
                          aria-invalid={otpError ? true : undefined}
                        />
                      ),
                    )}
                  </InputOTPGroup>
                </InputOTP>
              )}
            />

            {otpError ? (
              <p className="oh-field-error text-center text-[12px] text-[color:var(--destructive)]">
                {otpError}
              </p>
            ) : verifyStatus ? (
              <p className="text-center text-[12px] font-medium opacity-65">
                {verifyStatus}
              </p>
            ) : null}
          </form>

          <p className="mt-4 text-center text-[13px] font-medium opacity-55">
            {t("verifyOtpDidntReceive")}{" "}
            <button
              type="button"
              onClick={resend}
              disabled={resendCountdown > 0 || isBusy}
              className="oh-focus-ring rounded-(--oh-r-xs) font-semibold text-[color:var(--oh-ink)] opacity-100 transition-opacity hover:opacity-65 disabled:cursor-not-allowed disabled:opacity-35"
            >
              {resendCountdown > 0
                ? t("verifyOtpResendIn", { seconds: resendCountdown })
                : t("verifyOtpResend")}
            </button>
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function truncateEmail(email: string, max = 30): string {
  if (email.length <= max) return email;
  return `${email.slice(0, max - 1)}…`;
}
