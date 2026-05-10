"use client";

import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { Monitor, Sun, Moon } from "lucide-react";
import { useMounted } from "@/hooks/use-mounted";
import { SectionHeader } from "@/components/oh/section-header";
import { OhCard } from "@/components/oh/oh-card";

const THEMES = ["system", "light", "dark"] as const;
type ThemeValue = (typeof THEMES)[number];

function isThemeValue(v: unknown): v is ThemeValue {
  return v === "system" || v === "light" || v === "dark";
}

export function ThemeFields() {
  const t = useTranslations("Settings");
  const { theme, systemTheme, setTheme } = useTheme();
  const mounted = useMounted();
  const current: ThemeValue =
    mounted && isThemeValue(theme) ? theme : "system";

  const osPref =
    systemTheme === "dark" || systemTheme === "light" ? systemTheme : null;
  const divergesFromOs =
    current !== "system" && osPref !== null && current !== osPref;

  return (
    <section aria-labelledby="theme-legend">
      <SectionHeader
        legendId="theme-legend"
        legend={t("themeLegend")}
        description={t("themeDescription")}
      />
      <div
        role="radiogroup"
        aria-labelledby="theme-legend"
        className="mt-5 flex flex-wrap gap-2"
      >
        {THEMES.map((value) => (
          <ThemeCard
            key={value}
            value={value}
            label={t(
              `theme${value.charAt(0).toUpperCase()}${value.slice(1)}` as
                | "themeSystem"
                | "themeLight"
                | "themeDark",
            )}
            selected={value === current}
            onSelect={() => setTheme(value)}
          />
        ))}
      </div>
      {mounted && divergesFromOs && osPref ? (
        <p
          aria-live="polite"
          className="mt-4 oh-eyebrow flex flex-wrap items-baseline gap-x-2 gap-y-1 opacity-100"
        >
          <span className="opacity-65">
            {t("themeOsHint", {
              pref:
                osPref === "dark"
                  ? t("themeDark").toLowerCase()
                  : t("themeLight").toLowerCase(),
            })}
          </span>
          <button
            type="button"
            onClick={() => setTheme("system")}
            className="oh-focus-ring rounded-(--oh-r-xs) -mx-1 px-1 underline underline-offset-2 decoration-[1.5px] transition-colors hover:bg-oh-tint focus-visible:bg-oh-tint"
          >
            {t("themeFollowOs")}
          </button>
        </p>
      ) : null}
    </section>
  );
}

function ThemeCard({
  value,
  label,
  selected,
  onSelect,
}: {
  value: ThemeValue;
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const Icon = value === "system" ? Monitor : value === "light" ? Sun : Moon;
  return (
    <OhCard
      asChild
      active={selected}
      className="group w-[110px] cursor-pointer p-3 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--oh-ink)]"
    >
      <label className="flex flex-col gap-2">
        <input
          type="radio"
          name="theme"
          value={value}
          className="sr-only"
          checked={selected}
          onChange={onSelect}
        />
        <ThemeSwatch value={value} />
        <div className="flex items-center justify-between gap-1.5 px-0.5">
          <span
            className={`oh-eyebrow tracking-[1.5px] ${
              selected ? "opacity-100" : ""
            }`}
          >
            {label}
          </span>
          <Icon
            className={`size-3.5 shrink-0 transition-opacity duration-150 ease-oh ${
              selected
                ? "opacity-100"
                : "opacity-55 group-hover:opacity-100"
            }`}
            strokeWidth={2.5}
            aria-hidden
          />
        </div>
      </label>
    </OhCard>
  );
}

const PAPER_LIGHT = "#eee7d5";
const INK_LIGHT = "#0a0a0a";
const PAPER_DARK = "#0a0a0a";
const INK_DARK = "#ede4cf";

function ThemeSwatch({ value }: { value: ThemeValue }) {
  if (value === "system") {
    return (
      <div className="relative h-12 overflow-hidden border border-oh-line rounded-(--oh-r-xs)">
        <div className="absolute inset-0 grid grid-cols-2">
          <SwatchHalf paper={PAPER_LIGHT} ink={INK_LIGHT} />
          <SwatchHalf paper={PAPER_DARK} ink={INK_DARK} />
        </div>
      </div>
    );
  }
  const paper = value === "light" ? PAPER_LIGHT : PAPER_DARK;
  const ink = value === "light" ? INK_LIGHT : INK_DARK;
  return (
    <div
      className="relative h-12 overflow-hidden border border-oh-line rounded-(--oh-r-xs)"
      style={{ backgroundColor: paper }}
    >
      <SwatchMark ink={ink} />
    </div>
  );
}

function SwatchHalf({ paper, ink }: { paper: string; ink: string }) {
  return (
    <div
      className="relative flex items-center justify-center"
      style={{ backgroundColor: paper }}
    >
      <SwatchMark ink={ink} />
    </div>
  );
}

function SwatchMark({ ink }: { ink: string }) {
  return (
    <span
      className="font-sans text-[14px] font-bold leading-none"
      style={{ color: ink }}
    >
      Aa
    </span>
  );
}
