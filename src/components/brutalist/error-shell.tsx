import type { ReactNode } from "react";
import Link from "next/link";

// Reusable shell for not-found / error / global-error pages.
// Brutalist: paper background, sharp 2px border on the link items,
// monospace metadata. No animation, no hero image — error pages
// should load fast and read fast.
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
    <main className="bru-main">
      <div className="mx-auto w-full max-w-[760px] px-4 py-12 sm:px-6 sm:py-16">
        <p className="font-[family-name:var(--bru-mono)] text-[11px] font-extrabold tracking-[2.5px] uppercase opacity-55">
          {label}
        </p>
        <h1 className="mt-4 text-bru-h1 font-black uppercase tracking-tight">
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
        className="group block border-2 border-bru-line p-5 transition-colors duration-150 ease-bru hover:border-bru-line-strong hover:bg-bru-tint"
      >
        <p className="font-[family-name:var(--bru-mono)] text-[10px] font-extrabold tracking-[2px] uppercase opacity-55 group-hover:opacity-90">
          {description}
        </p>
        <p className="mt-2 text-[16px] font-black leading-tight">
          {title} <span aria-hidden>→</span>
        </p>
      </Link>
    </li>
  );
}
