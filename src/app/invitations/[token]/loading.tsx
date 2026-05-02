// Skeleton for the invitation preview while the server-side fetch
// resolves (B.PT81). Closes QA-2 from `docs/qa-pass-2026-05-02.md`:
// without this, hard-navigating to `/invitations/<token>` showed a
// brief blank during the server render's TTFB. The eyebrow + title
// + dl rows match the final layout so first paint reads as "loading
// content" rather than "page broken." Layout matches
// `components/invitation-accept.tsx` shape one-for-one — same
// max-width column, same border-rule, same dl row anatomy — so the
// swap to real content doesn't shift the page.
//
// Pattern reference: cal.com pages render a route-level loading.tsx
// for routes that perform server-side fetches; dub does the same on
// every dashboard route. We're aligning the public invitation route
// with that convention.
export default function InvitationLoading() {
  return (
    <div className="min-h-screen bg-oh-bg">
      <main className="mx-auto max-w-md px-6 pt-20 sm:pt-32">
        <header>
          <p className="oh-eyebrow opacity-30">Invitation</p>
          <SkeletonBar className="mt-4 h-9 w-3/4" />
          <SkeletonBar className="mt-5 h-3 w-full" />
          <SkeletonBar className="mt-2 h-3 w-5/6" />
        </header>

        <dl className="mt-8 flex flex-col gap-3 border-t-2 border-oh-line-strong pt-6">
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </dl>

        <div className="mt-8 flex flex-col gap-3">
          <SkeletonBar className="h-10 w-full" />
        </div>
      </main>
    </div>
  );
}

function SkeletonBar({ className }: { className?: string }) {
  // Subtle pulse via the project's existing token color — no new
  // animation primitive needed. `oh-tint` is ~6% ink, `oh-tint-hover`
  // is the same with the same alpha, so the bar reads as a quiet
  // placeholder against the paper bg without competing with real
  // chrome on adjacent routes.
  return (
    <div
      className={`animate-pulse rounded-(--oh-r-xs) bg-[color:var(--oh-tint)] ${className ?? ""}`}
    />
  );
}

function SkeletonRow() {
  return (
    <div className="flex items-baseline justify-between gap-x-4">
      <SkeletonBar className="h-3 w-16" />
      <SkeletonBar className="h-3 w-32" />
    </div>
  );
}
