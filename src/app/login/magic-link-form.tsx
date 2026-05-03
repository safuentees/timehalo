"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export default function MagicLinkForm() {
  const t = useTranslations("Auth");
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
      setError(t("magicLinkError"));
      return;
    }

    setSentTo(trimmed);
  };

  if (sentTo) {
    return (
      <div className="grid gap-3">
        <p className="text-[13px] leading-[1.5] opacity-65">
          {t.rich("magicLinkSentTo", {
            email: () => (
              <span className="font-medium text-[color:var(--oh-ink)] opacity-100">
                {sentTo}
              </span>
            ),
          })}
        </p>
        <button
          type="button"
          onClick={() => {
            setSentTo(null);
            setEmail("");
          }}
          className="oh-eyebrow self-start opacity-55 transition-opacity hover:opacity-100"
        >
          {t("magicLinkUseDifferent")}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3">
      <div className="grid gap-2">
        <label htmlFor="magic-link-email" className="oh-legend">
          {t("magicLinkLabel")}
        </label>
        <input
          id="magic-link-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("fieldEmailPlaceholder")}
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
        {submitting ? t("magicLinkSubmitPending") : t("magicLinkSubmit")}
      </Button>
    </form>
  );
}
