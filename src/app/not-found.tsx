import { getTranslations } from "next-intl/server";
import {
  ErrorShell,
  ErrorShellLink,
} from "@/components/oh/error-shell";

export default async function NotFound() {
  const t = await getTranslations("NotFound");
  return (
    <ErrorShell
      label={t("label")}
      title={t("title")}
      description={t("description")}
    >
      <ErrorShellLink
        href="/"
        title={t("homeTitle")}
        description={t("homeDescription")}
      />
      <ErrorShellLink
        href="/login"
        title={t("signInTitle")}
        description={t("signInDescription")}
      />
      <ErrorShellLink
        href="/register"
        title={t("createAccountTitle")}
        description={t("createAccountDescription")}
      />
    </ErrorShell>
  );
}
