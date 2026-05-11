import { cn } from "@/lib/utils";

// B.PT309 — GitHub brand mark, INLINE SVG.
//
// Why inline and not `<img>` or CSS mask:
//   • `<img src="/icons/github.svg">` doesn't propagate the parent's
//     CSS `color` into the SVG content, so the icon falls back to
//     the SVG-spec default `fill: black` — invisible in dark mode
//     and wrong-color in any non-black theme.
//   • CSS `mask-image: url("/icons/github.svg")` has spotty cross-
//     browser support: Safari doesn't reliably handle external SVG
//     references (MDN browser-compat #26358), and even WebKit-based
//     browsers have quirks rasterizing the alpha channel from a
//     `/public/` URL. Tried it, didn't render reliably.
//   • Inline SVG is bulletproof: no external fetch, no CSP question,
//     no mask compatibility surface, no Turbopack caching. `fill=
//     "currentColor"` lets the icon inherit the parent button's text
//     color naturally — same theme behavior as a Lucide icon.
//
// The chisel rule against inline `<svg><path d="...">` exists for
// project-specific icons (use a library). Brand marks like the
// GitHub Mark are a reasonable exception: the path is canonical,
// never edited, and not available in Lucide (deprecated brand icons
// per github.com/lucide-icons/lucide#2792). The 2026 standard
// recommendation for brand icons is `simpleicons.org`, and the path
// below is the official GitHub mark from there.
export function GithubMark({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      className={cn(className ?? "size-4")}
    >
      <path d="M6.766 11.328c-2.063-.25-3.516-1.734-3.516-3.656 0-.781.281-1.625.75-2.188-.203-.515-.172-1.609.063-2.062.625-.078 1.468.25 1.968.703.594-.187 1.219-.281 1.985-.281.765 0 1.39.094 1.953.265.484-.437 1.344-.765 1.969-.687.218.422.25 1.515.046 2.047.5.593.766 1.39.766 2.203 0 1.922-1.453 3.375-3.547 3.64.531.344.89 1.094.89 1.954v1.625c0 .468.391.734.86.547C13.781 14.359 16 11.53 16 8.03 16 3.61 12.406 0 7.984 0 3.563 0 0 3.61 0 8.031a7.88 7.88 0 0 0 5.172 7.422c.422.156.828-.125.828-.547v-1.25c-.219.094-.5.156-.75.156-1.031 0-1.64-.562-2.078-1.609-.172-.422-.36-.672-.719-.719-.187-.015-.25-.093-.25-.187 0-.188.313-.328.625-.328.453 0 .844.281 1.25.86.313.452.64.655 1.031.655s.641-.14 1-.5c.266-.265.47-.5.657-.656" />
    </svg>
  );
}
