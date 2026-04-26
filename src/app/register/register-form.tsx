"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
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
  const {
    register: registerField,
    handleSubmit,
    control,
    setValue,
    setError,
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

      router.push("/");
      router.refresh();
    },
    onError: (error) => {
      if (error.data?.code !== "CONFLICT") return;

      if (error.message.toLowerCase().includes("email")) {
        setError("email", { message: error.message });
        return;
      }

      setError("handle", { message: error.message });
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
    }
  });

  const isBusy = isSubmitting || registerMutation.isPending;
  const canSubmit = availability === "available" && !isBusy;

  return (
    <form onSubmit={onSubmit} className="grid gap-5">
      <div className="grid gap-2">
        <Label className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Email
        </Label>
        <Input
          type="email"
          placeholder="you@domain.com"
          autoComplete="email"
          {...registerField("email")}
          className="text-sm"
        />
        {errors.email ? (
          <p className="font-mono text-[10px] tracking-wide text-destructive">
            {errors.email.message}
          </p>
        ) : null}
      </div>

      <div className="grid gap-2">
        <Label className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Password
        </Label>
        <Input
          type="password"
          placeholder="8+ characters"
          autoComplete="new-password"
          {...registerField("password")}
          className="text-sm"
        />
        {errors.password ? (
          <p className="font-mono text-[10px] tracking-wide text-destructive">
            {errors.password.message}
          </p>
        ) : null}
      </div>

      <div className="grid gap-2">
        <Label className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Handle
        </Label>
        <InputGroup>
          <InputGroupAddon>
            <InputGroupText>officehours.app/h/</InputGroupText>
          </InputGroupAddon>
          <InputGroupInput
            placeholder="alex"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={30}
            name="handle"
            value={handle}
            onChange={(e) =>
              setValue(
                "handle",
                e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
                { shouldDirty: true, shouldValidate: true },
              )
            }
          />
          <InputGroupAddon align="inline-end">
            <AvailabilityBadge state={availability} />
          </InputGroupAddon>
        </InputGroup>
        <HandleHelp state={availability} />
        {errors.handle ? (
          <p className="font-mono text-[10px] tracking-wide text-destructive">
            {errors.handle.message}
          </p>
        ) : null}
      </div>

      {errors.root?.message ? (
        <p className="font-mono text-xs text-destructive">
          {errors.root.message}
        </p>
      ) : null}

      <Button
        type="submit"
        disabled={!canSubmit}
        size="sm"
        className="font-mono text-xs tracking-wide"
      >
        {isBusy ? "Creating..." : "Create account"}
      </Button>
    </form>
  );
}

function AvailabilityBadge({ state }: { state: Availability }) {
  switch (state) {
    case "checking":
      return (
        <InputGroupText className="text-muted-foreground">…</InputGroupText>
      );
    case "available":
      return (
        <InputGroupText className="text-green-600 dark:text-green-400">
          free
        </InputGroupText>
      );
    case "taken":
      return <InputGroupText className="text-destructive">taken</InputGroupText>;
    case "invalid":
      return (
        <InputGroupText className="text-muted-foreground">3+</InputGroupText>
      );
    case "error":
      return <InputGroupText className="text-destructive">!</InputGroupText>;
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
      ? "text-destructive"
      : state === "available"
        ? "text-muted-foreground"
        : "text-muted-foreground";
  return (
    <p className={`font-mono text-[10px] tracking-wide ${tone}`}>{text}</p>
  );
}
