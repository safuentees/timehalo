"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export default function MagicLinkForm() {
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;

    setSubmitting(true);
    setError("");

    const res = await signIn("magic-link", {
      email: trimmed,
      redirect: false,
    });

    setSubmitting(false);

    if (res?.error) {
      setError("Could not send magic link. Try again.");
      return;
    }

    setSentTo(trimmed);
  };

  if (sentTo) {
    return (
      <p className="font-mono text-xs tracking-wide text-muted-foreground text-pretty">
        Check your email — link sent to{" "}
        <span className="text-foreground">{sentTo}</span>
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3">
      <div className="grid gap-2">
        <Label className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Magic link
        </Label>
        <Input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="text-sm"
        />
      </div>
      {error && (
        <p className="font-mono text-xs text-destructive">{error}</p>
      )}
      <Button
        type="submit"
        variant="outline"
        size="sm"
        className="w-full font-mono text-xs tracking-wide border-foreground/20 transition-colors duration-200 hover:bg-foreground/[0.06] hover:border-foreground/40"
        disabled={submitting}
      >
        {submitting ? "Sending..." : "Email me a sign-in link"}
      </Button>
    </form>
  );
}
