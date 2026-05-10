"use client";

import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { Monitor, Sun, Moon } from "lucide-react";
import { useMounted } from "@/hooks/use-mounted";
import { SectionHeader } from "@/components/oh/section-header";
import { OhCard } from "@/components/oh/oh-card";

// Three-option theme picker: system / light / dark.
//
// Two next-themes values matter (FAQ makes the distinction load-bearing):
//   • theme       — the user's pick ("system" | "light" | "dark")
//   • systemTheme — what the OS prefers ("light" | "dark"), live via
//                   matchMedia, regardless of pick.
//
// The cards reflect `theme`. When the pick diverges from the OS we
// surface a one-click jump back — per next-themes' matchMedia listener,
// OS changes only re-apply to the DOM while `theme === "system"`.
// Otherwise no after-text: the picked card and the page itself are the
// affordance. Pattern: GitHub Settings → Appearance + Stripe Dashboard.

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
        // Hint typography uses the canonical `oh-eyebrow` class
        // (mono 10px, font-weight 800, tracking 2px, uppercase).
        // CSS opacity compounds — putting opacity-65 on the parent
        // would dim the inline button too even with an opacity-100
        // override. Mute only the static span; the action span
        // stays at full ink so it reads as the affordance.
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

// Single preview card. Three things land in the user's eye in order:
// (1) the swatch — they see what the theme actually looks like, not a
// generic icon; (2) the icon — quick semantic anchor for scanners; (3)
// the label — confirms intent.
//
// Chrome refreshed to match the rest of the dashboard's depth-card
// vocabulary (B.PT289). Was a 2px brutalist-bordered card with an
// inverse-fill selected state (`border-oh-content bg-oh-content
// text-oh-bg`). Replaced with `<OhCard asChild active={selected}>`:
//   - All cards: paper bg + `--oh-shadow-resting` at rest, lift to
//     `--oh-shadow-hover` on hover.
//   - Selected: `active` prop pins the elevated shadow at rest +
//     drops the hover lift (it's already lifted). Same vocabulary
//     OhPillSwitcher, the active sidebar nav row, and every
//     billing / workspaces / event-types depth-card surface speak.
//   - Outer 6px corner radius (`--oh-r-sm`) baked into OhCard.
// Removes the brutalist 2px border + inversion that read as foreign
// against the rest of the appearance section's settings chrome.
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
            // Override the default oh-eyebrow opacity-55 on selected
            // cards — the elevated card needs full-strength text to
            // read as the active option without a separate badge.
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

// Mini preview using HARDCODED hex pairs that mirror :root and .dark
// tokens in globals.css. Hardcoding (rather than CSS vars) is the
// point — the swatch must show what each theme looks like regardless of
// which theme is currently active. If you change the palette tokens in
// globals.css, mirror the change here.
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

// The "Aa" mark uses Space Grotesk to mirror the actual app body font.
// Caps + lowercase together make the contrast pair legible at 14px.
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
