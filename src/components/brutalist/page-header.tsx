import type { ReactNode } from "react";

// Repo-wide page header — display title + bottom rule + optional
// right-aligned aside slot for page-level metadata (live status,
// counts, etc).
//
// Sticking with `border-b-2 border-bru-line-strong` (no radius) because
// it reads as a horizontal rule, not a card edge. Curves go on cards
// below; this one stays sharp.
//
// `kicker` is optional and intentionally bare: only pass one when the
// eyebrow carries data the title doesn't (a status string, a count,
// the host handle, etc.). Don't pass static labels — the sidebar
// already establishes route context.
//
// `aside` is for chrome-level indicators that belong WITH the title
// (live-feed status dot, sync state, etc) — not for content. Keeps
// metadata out of the data-reading zone below the rule.

type Props = {
  /** Big black uppercase title. Plain string — no nested markup needed. */
  title: string;
  /** Optional small mono uppercase eyebrow. Use only for real data, not labels. */
  kicker?: string;
  /** Right-aligned slot in the title row for page-level chrome (status indicators). */
  aside?: ReactNode;
};

export function BrutalistPageHeader({ kicker, title, aside }: Props) {
  return (
    <div className="border-b-2 border-bru-line-strong pb-6">
      {kicker ? (
        <p className="font-[family-name:var(--bru-mono)] text-[11px] font-extrabold tracking-[2.5px] uppercase opacity-55">
          {kicker}
        </p>
      ) : null}
      <div className="flex items-baseline justify-between gap-4">
        <h1
          className={`${
            kicker ? "mt-3" : ""
          } text-bru-h2 font-black uppercase tracking-tight`}
        >
          {title}
        </h1>
        {aside ? <div className="shrink-0">{aside}</div> : null}
      </div>
    </div>
  );
}
