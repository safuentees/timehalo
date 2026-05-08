import type { ReactNode } from "react";
import Link from "next/link";

// Bare shell for /admin/*. Auth + admin gate live in each page.tsx
// (repo convention — keep permission checks in pages, not layouts) so
// the layout stays pure presentation.

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <main className="oh-main">
      <div className="mx-auto w-full max-w-[920px] px-4 py-8 sm:px-6 sm:py-10">
        <div className="oh-rule pb-6">
          <p className="oh-legend">
            Officehours / Admin
          </p>
          <h1 className="mt-3 text-oh-h2 font-black uppercase tracking-tight">
            Operator surface
          </h1>
        </div>
        <nav className="mt-5 flex flex-wrap gap-x-6 gap-y-2 font-[family-name:var(--oh-mono)] text-[11px] font-extrabold tracking-[2px] uppercase">
          <Link href="/admin/feature-flags" className="underline-offset-4 hover:underline">
            Feature flags
          </Link>
          <Link href="/admin/webhooks" className="underline-offset-4 hover:underline">
            Webhooks
          </Link>
          <Link href="/admin" className="underline-offset-4 hover:underline opacity-65">
            Audit (open via /admin/audit/&lt;uid&gt;)
          </Link>
        </nav>
        <div className="mt-8">{children}</div>
      </div>
    </main>
  );
}
