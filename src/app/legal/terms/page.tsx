import type { Metadata } from "next";

// L2 — Terms of service. Draft template — operator reviews with
// counsel before public launch. Liability limits + governing law
// vary by jurisdiction; this is a starting point, not a polished
// final draft.

export const metadata: Metadata = {
  title: "Terms of service — Officehours",
  description: "Terms of service for Officehours.",
};

export default function TermsPage() {
  return (
    <article className="mx-auto flex max-w-prose flex-col gap-6 px-4 py-16 sm:px-6 sm:py-24">
      <p className="oh-eyebrow">Legal</p>
      <h1 className="text-[clamp(1.75rem,1rem+3vw,2.5rem)] font-extrabold tracking-tight">
        Terms of service
      </h1>
      <p className="oh-description">
        Last updated: 2026-05-07. This document is a starting draft.
        Final wording should be reviewed by counsel before public launch.
      </p>

      <h2 className="mt-8 text-xl font-bold">Acceptance</h2>
      <p className="oh-description">
        By creating an account or making a booking on Officehours,
        you agree to these terms.
      </p>

      <h2 className="mt-8 text-xl font-bold">Acceptable use</h2>
      <ul className="oh-description ml-6 list-disc">
        <li>You are responsible for activity under your account.</li>
        <li>
          Don't use Officehours to send spam, harass, or harvest
          contact information.
        </li>
        <li>
          Don't attempt to bypass rate limits, the booking idempotency
          check, or any access control.
        </li>
      </ul>

      <h2 className="mt-8 text-xl font-bold">Account termination</h2>
      <p className="oh-description">
        You can delete your account at any time at
        <code>/settings/danger</code>. We reserve the right to
        suspend accounts for abuse or violations of acceptable use.
      </p>

      <h2 className="mt-8 text-xl font-bold">Liability</h2>
      <p className="oh-description">
        Officehours is provided "as is" without warranty. We are not
        liable for missed bookings, calendar sync delays, or
        third-party service outages (Stripe, Resend, calendar
        providers). Maximum liability for any claim is capped at
        the amount paid in the trailing 12 months.
      </p>

      <h2 className="mt-8 text-xl font-bold">Governing law</h2>
      <p className="oh-description">
        These terms are governed by the laws of the state in which
        Officehours is incorporated. Disputes are resolved through
        binding arbitration unless otherwise required by your local
        consumer-protection law.
      </p>

      <h2 className="mt-8 text-xl font-bold">Changes</h2>
      <p className="oh-description">
        We may update these terms; material changes are announced via
        email to active hosts at least 30 days before they take effect.
      </p>

      <h2 className="mt-8 text-xl font-bold">Contact</h2>
      <p className="oh-description">
        Questions? Email <code>support@officehours.app</code>.
      </p>
    </article>
  );
}
