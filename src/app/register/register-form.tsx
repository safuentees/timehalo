"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";

// Stub availability check. In a real app this would be a debounced
// tRPC query hitting the DB. Kept client-side here so the demo works
// without any schema changes.
const TAKEN_HANDLES = new Set([
  "admin",
  "root",
  "api",
  "santiago",
  "me",
  "test",
  "alex",
]);

type Availability = "idle" | "checking" | "available" | "taken" | "invalid";

type Form = {
  email: string;
  password: string;
  handle: string;
};

export function RegisterForm() {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<Form>({
    defaultValues: { email: "", password: "", handle: "" },
    mode: "onBlur",
  });

  const handle = watch("handle");
  const [availability, setAvailability] = useState<Availability>("idle");

  // Debounced availability check — runs 400ms after the user stops typing.
  useEffect(() => {
    if (!handle) {
      setAvailability("idle");
      return;
    }
    if (handle.length < 3) {
      setAvailability("invalid");
      return;
    }
    setAvailability("checking");
    const id = setTimeout(() => {
      setAvailability(TAKEN_HANDLES.has(handle) ? "taken" : "available");
    }, 400);
    return () => clearTimeout(id);
  }, [handle]);

  const onSubmit = handleSubmit(async () => {
    // Stub — would call a tRPC auth.register mutation in a real build.
    await new Promise((r) => setTimeout(r, 600));
    alert(`Would register ${handle}`);
  });

  const canSubmit = availability === "available" && !isSubmitting;

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
          {...register("email", { required: true })}
          className="text-sm"
        />
      </div>

      <div className="grid gap-2">
        <Label className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Password
        </Label>
        <Input
          type="password"
          placeholder="8+ characters"
          autoComplete="new-password"
          {...register("password", { required: true, minLength: 8 })}
          className="text-sm"
        />
        {errors.password ? (
          <p className="font-mono text-[10px] tracking-wide text-destructive">
            At least 8 characters.
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
            value={handle}
            onChange={(e) =>
              setValue(
                "handle",
                e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
                { shouldValidate: true },
              )
            }
          />
          <InputGroupAddon align="inline-end">
            <AvailabilityBadge state={availability} />
          </InputGroupAddon>
        </InputGroup>
        <HandleHelp state={availability} />
      </div>

      <Button
        type="submit"
        disabled={!canSubmit}
        size="sm"
        className="font-mono text-xs tracking-wide"
      >
        {isSubmitting ? "Creating…" : "Create account"}
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
