"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { trpc } from "@/trpc/hooks";
import { Button } from "@/components/ui/button";

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
