"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { PRIMARY_NAV, SECONDARY_NAV } from "@/lib/brutalist";

export function BrutalistSidebar() {
  const pathname = usePathname();

  return (
    <aside className="bru-sidebar">
      <div className="bru-brand">
        <div className="bru-monogram">N</div>
        <div className="bru-brand-name">
          <div>NICO</div>
          <div className="bru-brand-sub">WRITING</div>
        </div>
      </div>

      <div className="bru-nav-group">
        <div className="bru-nav-label">LIBRARY</div>
        {PRIMARY_NAV.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`bru-nav-item ${active ? "bru-nav-active" : ""}`}
            >
              <span className="bru-nav-bullet" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>

      <div className="bru-nav-group">
        <div className="bru-nav-label">WORKSPACE</div>
        {SECONDARY_NAV.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`bru-nav-item ${active ? "bru-nav-active" : ""}`}
            >
              <span className="bru-nav-bullet" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>

      <div style={{ flex: 1 }} />

      <button
        type="button"
        className="bru-signout"
        onClick={() => signOut({ redirectTo: "/login" })}
      >
        <span aria-hidden>↩</span>
        <span>Sign out</span>
      </button>
    </aside>
  );
}
