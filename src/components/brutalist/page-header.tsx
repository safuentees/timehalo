// Repo-wide page header — kicker + display title + bottom rule.
// Bookings is the canonical reference; this just lifts the pattern so
// /profile, /availability, /settings can stop hand-rolling it.
//
// Sticking with `border-b-2 border-bru-line-strong` (no radius) because
// it reads as a horizontal rule, not a card edge. Curves go on cards
// below; this one stays sharp.

type Props = {
  /** Small mono uppercase eyebrow above the title (e.g. "Host · Bookings"). */
  kicker: string;
  /** Big black uppercase title. Plain string — no nested markup needed. */
  title: string;
};

export function BrutalistPageHeader({ kicker, title }: Props) {
  return (
    <div className="border-b-2 border-bru-line-strong pb-6">
      <p className="font-[family-name:var(--bru-mono)] text-[11px] font-extrabold tracking-[2.5px] uppercase opacity-55">
        {kicker}
      </p>
      <h1 className="mt-3 text-bru-h2 font-black uppercase tracking-tight">
        {title}
      </h1>
    </div>
  );
}
