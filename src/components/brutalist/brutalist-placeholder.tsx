"use client";

import { BrutalistTicker } from "./ticker";

export function BrutalistPlaceholder({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  return (
    <main className="bru-main" id="top">
      <BrutalistTicker />

      <section
        className="bru-hero bru-reveal"
        style={{ ["--d" as string]: "80ms" }}
      >
        <div className="bru-hero-dotted" aria-hidden />
        <div className="bru-hero-inner">
          <div
            style={{
              fontFamily: "var(--bru-mono)",
              fontSize: 11,
              letterSpacing: 2.5,
              fontWeight: 700,
              opacity: 0.6,
              marginBottom: 18,
            }}
          >
            {eyebrow}
          </div>
          <h1 className="bru-headline">{title}</h1>
          <div className="bru-hero-foot">
            <p className="bru-dek">{subtitle}</p>
            <div className="bru-hero-meta">
              <span>STATUS · COMING SOON</span>
            </div>
          </div>
        </div>
      </section>

    </main>
  );
}
