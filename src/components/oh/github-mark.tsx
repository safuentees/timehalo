import { cn } from "@/lib/utils";

// B.PT309 — monochrome GitHub mark, rendered via CSS mask.
//
// Why a mask and not `<img>`: `<img src="/icons/github.svg">` can't
// inherit the parent's text color — the IMG element's CSS `color`
// doesn't propagate into the SVG content, so the SVG falls back to
// the default `fill: black` per SVG spec. In any theme where the
// surrounding text isn't black, the icon either disappears
// (black-on-black in dark mode without `dark:invert`) or reads as a
// foreign color that doesn't match its label.
//
// `mask-image` reads only the SVG's ALPHA channel — the fill color
// becomes irrelevant. The visible color comes from `bg-current`,
// which equals the parent's `color` (i.e. the button's text color).
// Net result: the icon ALWAYS matches its label, in any theme,
// without `<img>` color-routing tricks.
//
// Reference: this pattern is the 2026 canonical approach for
// monochrome brand icons (Tailwind UI, Vercel Design System, shadcn-
// recommended brand-icon technique). Lucide deprecated their `Github`
// icon (per github.com/lucide-icons/lucide#2792) so we own the SVG
// asset directly; this component is the rendering wrapper.
export function GithubMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block bg-current", className ?? "size-4")}
      style={{
        maskImage: "url(/icons/github.svg)",
        maskSize: "contain",
        maskRepeat: "no-repeat",
        maskPosition: "center",
        WebkitMaskImage: "url(/icons/github.svg)",
        WebkitMaskSize: "contain",
        WebkitMaskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
      }}
    />
  );
}
