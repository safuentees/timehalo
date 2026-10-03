"use client";

import { useActionState } from "react";
import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { startGuest } from "@/app/actions/start-guest";

export function GuestStartButton() {
  const t = useTranslations("Landing");
  const [state, action, pending] = useActionState(startGuest, { error: false });
  return (
    <form action={action} aria-busy={pending}>
      <Button type="submit" variant="oh" size="oh" className="h-11 px-5" disabled={pending} aria-describedby={state.error ? "guest-start-error" : undefined}>
        {pending ? t("startingGuest") : t("tryDemo")}
        <ArrowRight aria-hidden strokeWidth={1.5} className="size-4" />
      </Button>
      {state.error ? <p id="guest-start-error" role="alert" className="mt-4 text-oh-sub text-pretty">{t("guestError")}</p> : null}
    </form>
  );
}
