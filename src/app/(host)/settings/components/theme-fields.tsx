"use client";

import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { useMounted } from "@/hooks/use-mounted";
import { Field } from "@/components/ui/field";

// Three-option theme picker: system / light / dark.
//
// Three values from useTheme() matter here, and the next-themes FAQ
// makes the distinction load-bearing:
//   • theme         — what the user picked ("system" | "light" | "dark")
//   • resolvedTheme — what's actually rendered ("light" | "dark";
//                     "system" gets resolved against prefers-color-scheme)
//   • systemTheme   — what the OS currently prefers ("light" | "dark"),
//                     regardless of pick. Updates live via matchMedia.
//
// The radio reflects `theme` (the durable pick). The hint underneath
// surfaces the live OS state so the user can always see whether
// prefers-color-scheme is being followed — and, when their pick
// disagrees with the OS, we offer a one-click jump back to "System".
//
// Why the affordance matters: per next-themes' matchMedia listener,
// OS changes only re-apply to the DOM when `theme === "system"`. If
// the user previously clicked light/dark (or the pre-c16fd32 topbar
// toggle did so for them), localStorage["theme"] is stuck on an
// explicit pick and OS toggling silently does nothing. The hint
// makes that state visible; the button makes it recoverable.

const THEMES = ["system", "light", "dark"] as const;
type ThemeValue = (typeof THEMES)[number];

function isThemeValue(v: unknown): v is ThemeValue {
  return v === "system" || v === "light" || v === "dark";
}

export function ThemeFields() {
  const t = useTranslations("Settings");
  const { theme, resolvedTheme, systemTheme, setTheme } = useTheme();
  // SSR returns no theme info; render the system default until the
  // provider rehydrates so the radio doesn't flicker mid-paint.
  const mounted = useMounted();
  const current: ThemeValue =
    mounted && isThemeValue(theme) ? theme : "system";

  const osPref =
    systemTheme === "dark" || systemTheme === "light" ? systemTheme : null;
  const isSystem = current === "system";
  const divergesFromOs =
    !isSystem && osPref !== null && current !== osPref;

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
      {mounted && osPref ? (
        <p
          aria-live="polite"
          className="mt-3 font-[family-name:var(--bru-mono)] text-[10px] tracking-[2px] uppercase opacity-55"
        >
          {isSystem ? (
            <>
              Following OS — currently{" "}
              <span className="opacity-100">
                {resolvedTheme === "dark"
                  ? t("themeDark").toLowerCase()
                  : t("themeLight").toLowerCase()}
              </span>
            </>
          ) : divergesFromOs ? (
            <>
              OS prefers{" "}
              <span className="opacity-100">
                {osPref === "dark"
                  ? t("themeDark").toLowerCase()
                  : t("themeLight").toLowerCase()}
              </span>{" "}
              — your pick overrides it.{" "}
              <button
                type="button"
                onClick={() => setTheme("system")}
                className="underline underline-offset-2 opacity-100 hover:opacity-80"
              >
                Follow OS
              </button>
            </>
          ) : (
            <>
              OS prefers{" "}
              <span className="opacity-100">
                {osPref === "dark"
                  ? t("themeDark").toLowerCase()
                  : t("themeLight").toLowerCase()}
              </span>{" "}
              — matches your pick.
            </>
          )}
        </p>
      ) : null}
    </Field>
  );
}
