"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import {
  OhInputGroup,
  OhInputGroupAddon,
  OhInputGroupInput,
  OhInputGroupText,
} from "@/components/oh/oh-input-group";
import { handleSchema, registerInputSchema } from "@/lib/register-schema";
import { useRegister } from "@/lib/mutations/use-register";
import { trpc } from "@/trpc/hooks";

type Availability =
  | "idle"
  | "checking"
  | "available"
  | "taken"
  | "invalid"
  | "error";

type Form = {
  email: string;
  password: string;
  handle: string;
};

export function RegisterForm() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const {
    register: registerField,
    handleSubmit,
    control,
    setValue,
    setError,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<Form>({
    defaultValues: { email: "", password: "", handle: "" },
    resolver: zodResolver(registerInputSchema),
    mode: "onBlur",
  });

  const watchedHandle = useWatch({ control, name: "handle" });
  const handle = watchedHandle ?? "";
  const handleReady = handleSchema.safeParse(handle).success;
  const handleAvailability = trpc.auth.handleAvailability.useQuery(
    { handle },
    {
      enabled: handleReady,
      retry: false,
    },
  );

  const registerMutation = useRegister({
    onSuccess: async (created, variables) => {
      const result = await signIn("credentials", {
        email: created.email,
        password: variables.password,
        redirect: false,
      });

      if (result?.error) {
        setError("root", {
          message:
            "Account created, but sign-in failed. Sign in from the login page.",
        });
        return;
      }

      router.push("/bookings");
      router.refresh();
    },
    onError: (error) => {
      if (error.data?.code !== "CONFLICT") return;

      // CONFLICT can fire on either the email column (account exists)
      // or the handle column (slug taken). Bind the error to the right
      // field AND scroll-focus it so the user lands directly on the
      // input that needs editing — react-hook-form's setFocus pattern,
      // mirrors cal.com's `onError` handlers.
      if (error.message.toLowerCase().includes("email")) {
        setError("email", { message: error.message });
        setFocus("email");
        return;
      }

      setError("handle", { message: error.message });
      setFocus("handle");
    },
  });

  const availability: Availability = !handle
    ? "idle"
    : !handleReady
      ? "invalid"
      : handleAvailability.isError
        ? "error"
        : handleAvailability.data
          ? handleAvailability.data.available
            ? "available"
            : "taken"
          : "checking";

  const onSubmit = handleSubmit(async (values) => {
    try {
      await registerMutation.mutateAsync(values);
    } catch {
      // The custom hook and field-level handlers above own user feedback.
    }
  });

  const isBusy = isSubmitting || registerMutation.isPending;
  const canSubmit = availability === "available" && !isBusy;

  return (
    <form onSubmit={onSubmit} className="grid gap-5">
      <div className="grid gap-2">
        <label htmlFor="register-email" className="oh-legend">
          Email
        </label>
        <input
          id="register-email"
          type="email"
          placeholder="you@domain.com"
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
          Password
        </label>
        <InputGroup className="overflow-hidden rounded-(--oh-r-xs) border-[1.5px] border-[color:var(--oh-ink)] bg-[color:var(--oh-paper)] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[color:var(--oh-ink)]">
          <InputGroupInput
            id="register-password"
            type={showPassword ? "text" : "password"}
            placeholder="8+ characters"
            autoComplete="new-password"
            aria-invalid={errors.password ? true : undefined}
            className="px-3 py-2.5 text-[15px] text-[color:var(--oh-ink)] placeholder:text-[color:var(--oh-placeholder)]"
            {...registerField("password")}
          />
          <InputGroupAddon align="inline-end" className="bg-transparent pr-2">
            <InputGroupButton
              type="button"
              size="icon-xs"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
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
        {errors.password ? (
          <p className="oh-field-error text-[12px] text-[color:var(--destructive)]">
            {errors.password.message}
          </p>
        ) : null}
      </div>

      <div className="grid gap-2">
        <label htmlFor="register-handle" className="oh-legend">
          Handle
        </label>
        <OhInputGroup>
          <OhInputGroupAddon>
            <OhInputGroupText>officehours.app/h/</OhInputGroupText>
          </OhInputGroupAddon>
          <OhInputGroupInput
            id="register-handle"
            placeholder="alex"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={30}
            name="handle"
            aria-invalid={errors.handle ? true : undefined}
            value={handle}
            onChange={(e) =>
              setValue(
                "handle",
                e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
                { shouldDirty: true, shouldValidate: true },
              )
            }
          />
          <OhInputGroupAddon align="inline-end">
            <AvailabilityBadge state={availability} />
          </OhInputGroupAddon>
        </OhInputGroup>
        <HandleHelp state={availability} />
        {errors.handle ? (
          <p className="oh-field-error text-[12px] text-[color:var(--destructive)]">
            {errors.handle.message}
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
        disabled={!canSubmit}
        className="w-full justify-center"
      >
        {isBusy ? "Creating…" : "Create account"}
      </Button>
    </form>
  );
}

function AvailabilityBadge({ state }: { state: Availability }) {
  switch (state) {
    case "checking":
      return (
        <InputGroupText className="text-[color:var(--oh-content-muted)] tracking-[3px]">
          …
        </InputGroupText>
      );
    case "available":
      return (
        <InputGroupText className="text-green-600 dark:text-green-400">
          free
        </InputGroupText>
      );
    case "taken":
      return (
        <InputGroupText className="text-[color:var(--destructive)]">
          taken
        </InputGroupText>
      );
    case "invalid":
      return (
        <InputGroupText className="text-[color:var(--oh-content-muted)]">
          3+
        </InputGroupText>
      );
    case "error":
      return (
        <InputGroupText className="text-[color:var(--destructive)]">
          !
        </InputGroupText>
      );
    default:
      return null;
  }
}

function HandleHelp({ state }: { state: Availability }) {
  const text =
    state === "taken"
      ? "That one's gone. Try another."
      : state === "invalid"
        ? "Minimum 3 characters. Letters, numbers, hyphens only."
        : state === "error"
          ? "Could not check this handle. Try again."
        : state === "available"
          ? "Available. You can change it later."
          : "Lowercase letters, numbers, hyphens.";
  const tone =
    state === "taken"
      ? "text-[color:var(--destructive)]"
      : "text-[color:var(--oh-content-muted)]";
  return <p className={`text-[12px] leading-[1.4] ${tone}`}>{text}</p>;
}
