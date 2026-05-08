"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { trpc } from "@/trpc/hooks";
import { Button } from "@/components/ui/button";

// C5 / L4 — GDPR / CCPA data export. Click triggers a serverside
// `users.exportData` query then downloads the JSON dump as a file.
// One-shot — no caching of the dump in browser memory beyond the
// download trigger. Same UX shape as Google Takeout / Stripe data
// export buttons: explicit user action → file appears in Downloads.
export function DataExportButton() {
  const t = useTranslations("DataExport");
  const [pending, setPending] = useState(false);
  const utils = trpc.useUtils();

  async function onClick() {
    setPending(true);
    try {
      const dump = await utils.users.exportData.fetch();
      const json = JSON.stringify(dump, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `officehours-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setPending(false);
    }
  }

  return (
    <Button
      variant="ohGhost"
      size="oh"
      onClick={onClick}
      disabled={pending}
    >
      {pending ? t("preparing") : t("button")}
    </Button>
  );
}
