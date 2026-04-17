"use client";

import { signIn } from "next-auth/react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

type LoginForm = {
  email: string;
  password: string;
};

export default function CredentialsForm() {
  const router = useRouter();
  const [error, setError] = useState("");
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
      setError("Invalid email or password");
    } else {
      router.push("/");
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-5">
      <div className="grid gap-2">
        <Label className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Email
        </Label>
        <Input
          type="email"
          placeholder="you@example.com"
          className="text-sm"
          {...register("email")}
        />
      </div>
      <div className="grid gap-2">
        <Label className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Password
        </Label>
        <Input
          type="password"
          placeholder="Enter your password"
          className="text-sm"
          {...register("password")}
        />
      </div>
      {error && (
        <p className="font-mono text-xs text-destructive">{error}</p>
      )}
      <Button
        type="submit"
        size="sm"
        className="w-full font-mono text-xs tracking-wide"
        disabled={isSubmitting}
      >
        {isSubmitting ? "Signing in..." : "Sign in"}
      </Button>
    </form>
  );
}
