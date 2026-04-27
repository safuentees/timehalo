"use client";

import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { useMounted } from "@/hooks/use-mounted";
import { Field } from "@/components/ui/field";

const THEMES = ["system", "light", "dark"] as const;
type ThemeValue = (typeof THEMES)[number];

function isThemeValue(v: unknown): v is ThemeValue {
  return v === "system" || v === "light" || v === "dark";
}

export function ThemeFields() {
  const t = useTranslations("Settings");
  const { theme, resolvedTheme, setTheme } = useTheme();
  const mounted = useMounted();
  const current: ThemeValue =
    mounted && isThemeValue(theme) ? theme : "system";

  const showResolvedHint =
    mounted && current === "system" && (resolvedTheme === "dark" || resolvedTheme === "light");

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
      {showResolvedHint ? (
        <p
          aria-live="polite"
          className="mt-3 font-[family-name:var(--bru-mono)] text-[10px] tracking-[2px] uppercase opacity-55"
        >
          Following OS — currently{" "}
          <span className="opacity-100">
            {resolvedTheme === "dark"
              ? t("themeDark").toLowerCase()
              : t("themeLight").toLowerCase()}
          </span>
        </p>
      ) : null}
    </Field>
  );
}
