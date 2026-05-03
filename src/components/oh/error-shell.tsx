import type { ReactNode } from "react";
import Link from "next/link";

// Reusable shell for not-found / error / global-error pages.
// Oh: paper background, sharp 2px border on the link items,
// monospace metadata. No animation, no hero image — error pages
// should load fast and read fast.
//
// B.PT109 — viewport-fill discipline + vertical center. Pre-B.PT109
// the `<main className="oh-main">` had no min-height + no flex setup,
// so short-content errors sat at the top of `oh-root` with empty
// space below. Now the column centers vertically — the error IS the
// content of the page, surfacing it in the optical center honors
// Apple HIG "deference / clarity" (the message belongs front + center,
// not pinned to the top with whitespace below). On overflow (long
// device narrow + lots of links), the column top-aligns + scrolls.
//
// Pattern reference: rallly /apps/web/src/components/error-page.tsx —
// label / title / description / link-list shape, brutalist'd.

export function ErrorShell({
  label,
  title,
  description,
  children,
  actions,
}: {
  label: string;
  title: string;
  description: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <main className="oh-main flex min-h-dvh flex-col items-center justify-center px-4 py-12 sm:px-6 sm:py-16">
      <div className="w-full max-w-[760px]">
        <p className="oh-legend">
          {label}
        </p>
        <h1 className="mt-4 text-oh-h1 font-black uppercase tracking-tight">
          {title}
        </h1>
        <p className="mt-4 max-w-prose text-[15px] leading-[1.55] opacity-75">
          {description}
        </p>
        <ul role="list" className="mt-10 flex flex-col gap-3">
          {children}
        </ul>
        {actions ? (
          <div className="mt-8 flex flex-wrap items-center gap-3">
            {actions}
          </div>
        ) : null}
      </div>
    </main>
  );
}

export function ErrorShellLink({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="group block border-2 border-oh-line p-5 transition-colors duration-150 ease-oh hover:border-oh-line-strong hover:bg-oh-tint"
      >
        <p className="oh-eyebrow group-hover:opacity-90">
          {description}
        </p>
        <p className="mt-2 text-[16px] font-black leading-tight">
          {title} <span aria-hidden>→</span>
        </p>
      </Link>
    </li>
  );
}
