"use client";

import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { useMounted } from "@/hooks/use-mounted";
import { Field } from "@/components/ui/field";

// Three-option theme picker: system / light / dark. Wires the existing
// next-themes provider in app/layout.tsx — the brutalist topbar's
// quick-toggle stays for the inline flip, this is the explicit
// "I want this preference durable" surface on /settings.
//
// Pattern reference: rallly /apps/web/src/app/[locale]/(space)/
// settings/preferences/components/theme-preference.tsx — same
// {system, light, dark} radio shape, brutalist'd.

const THEMES = ["system", "light", "dark"] as const;
type ThemeValue = (typeof THEMES)[number];

function isThemeValue(v: unknown): v is ThemeValue {
  return v === "system" || v === "light" || v === "dark";
}

export function ThemeFields() {
  const t = useTranslations("Settings");
  const { theme, setTheme } = useTheme();
  // SSR returns no theme info; render the system default until the
  // provider rehydrates so the radio doesn't flicker mid-paint.
  const mounted = useMounted();
  const current: ThemeValue =
    mounted && isThemeValue(theme) ? theme : "system";

  return (
    <Field>
      <p
        className="font-[family-name:var(--bru-mono)] text-[11px] font-extrabold tracking-[2.5px] uppercase opacity-55"
        id="theme-fields-label"
      >
        {t("themeLegend")}
      </p>
      <p className="mt-3 text-[13px] leading-[1.5] opacity-65 max-w-prose">
        {t("themeDescription")}
      </p>
      <fieldset
        aria-labelledby="theme-fields-label"
        className="mt-4 inline-flex flex-wrap gap-0 border-2 border-bru-line-strong"
      >
        {THEMES.map((value, idx) => (
          <label
            key={value}
            className={[
              "cursor-pointer px-4 py-2",
              "font-[family-name:var(--bru-mono)] text-[11px] font-extrabold tracking-[2px] uppercase",
              "transition-colors duration-150 ease-bru",
              idx > 0 ? "border-l-2 border-bru-line-strong" : "",
              value === current
                ? "bg-bru-content text-bru-bg"
                : "bg-bru-bg text-bru-content hover:bg-bru-tint",
            ].join(" ")}
          >
            <input
              type="radio"
              name="theme"
              value={value}
              className="sr-only"
              checked={value === current}
              onChange={() => setTheme(value)}
            />
            {t(`theme${value.charAt(0).toUpperCase()}${value.slice(1)}` as
              | "themeSystem"
              | "themeLight"
              | "themeDark")}
          </label>
        ))}
      </fieldset>
    </Field>
  );
}
