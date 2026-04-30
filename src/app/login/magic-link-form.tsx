"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
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
      <div className="grid gap-3">
        <p className="text-[13px] leading-[1.5] opacity-65">
          Check your email — link sent to{" "}
          <span className="font-medium text-[color:var(--oh-ink)] opacity-100">
            {sentTo}
          </span>
        </p>
        <button
          type="button"
          onClick={() => {
            setSentTo(null);
            setEmail("");
          }}
          className="oh-eyebrow self-start opacity-55 transition-opacity hover:opacity-100"
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3">
      <div className="grid gap-2">
        <label htmlFor="magic-link-email" className="oh-legend">
          Or send a magic link
        </label>
        <input
          id="magic-link-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          className="oh-input"
        />
      </div>
      {error ? (
        <p className="oh-field-error text-[12px] text-[color:var(--destructive)]">
          {error}
        </p>
      ) : null}
      <Button
        type="submit"
        variant="ohGhost"
        size="oh"
        className="w-full justify-center"
        disabled={submitting}
      >
        {submitting ? "Sending…" : "Email me a sign-in link"}
      </Button>
    </form>
  );
}
