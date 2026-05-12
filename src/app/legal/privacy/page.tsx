import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy policy — Officehours",
  description: "How Officehours collects, uses, and protects your data.",
};

export default function PrivacyPage() {
  return (
    <article className="mx-auto flex max-w-prose flex-col gap-6 px-4 py-16 sm:px-6 sm:py-24">
      <p className="oh-eyebrow">Legal</p>
      <h1 className="text-[clamp(1.75rem,1rem+3vw,2.5rem)] font-extrabold tracking-tight">
        Privacy policy
      </h1>
      <p className="oh-description">
        Last updated: 2026-05-07. This document is a starting draft.
        Final wording should be reviewed by counsel before public launch.
      </p>

      <h2 className="mt-8 text-xl font-bold">What we collect</h2>
      <ul className="oh-description ml-6 list-disc">
        <li>
          <strong>Hosts:</strong> name, email, password hash (bcrypt),
          handle, profile image URL, IANA timezone, weekly availability
          ranges, workspace memberships.
        </li>
        <li>
          <strong>Visitors:</strong> name, email, timezone, optional
          notes / question text submitted with each booking.
        </li>
        <li>
          <strong>Calendar:</strong> if a host connects Google or
          Microsoft Calendar, we store their OAuth access + refresh
          tokens encrypted at rest with AES-256-GCM. We read free-busy
          ranges and may write booking events when the host enables
          two-way sync.
        </li>
        <li>
          <strong>Operational:</strong> audit log entries
          (operationId only, no PII), webhook delivery state, IP
          address for rate-limiting (not stored beyond the
          rate-limit window).
        </li>
      </ul>

      <h2 className="mt-8 text-xl font-bold">Third parties</h2>
      <ul className="oh-description ml-6 list-disc">
        <li>
          <strong>Database:</strong> Turso (libsql) — iad1 region,
          provider-managed at-rest encryption + 24h
          point-in-time recovery.
        </li>
        <li>
          <strong>Email:</strong> Resend handles transactional
          email (booking confirmations, reminders, magic-link
          sign-in).
        </li>
        <li>
          <strong>Payments:</strong> Stripe processes paid plan
          subscriptions. We never store card data ourselves; Stripe
          tokens stay on Stripe&apos;s PCI-compliant infrastructure.
        </li>
        <li>
          <strong>Error monitoring:</strong> Sentry receives stack
          traces with a per-event redactor that strips email +
          name + booking notes (`src/lib/sentry-redact.ts`).
        </li>
        <li>
          <strong>OAuth:</strong> GitHub, Google (Calendar), and
          Microsoft (Calendar) verify your identity / calendar
          connection. We receive only the scopes you authorize at
          consent time.
        </li>
      </ul>

      <h2 className="mt-8 text-xl font-bold">Your rights</h2>
      <ul className="oh-description ml-6 list-disc">
        <li>
          <strong>Export.</strong> Download a JSON dump of every
          row tied to your account at <code>/settings/danger</code>
          → &ldquo;Download as JSON&rdquo;.
        </li>
        <li>
          <strong>Deletion.</strong> Permanently delete your
          account at <code>/settings/danger</code> → &ldquo;Delete
          account&rdquo;. The User row + cascading rows are removed
          immediately. Audit log entries (operationId only, no
          PII) are retained per our soft-delete + audit-survives
          policy.
        </li>
        <li>
          <strong>Correction.</strong> Edit your handle, name,
          email, and timezone at <code>/profile</code> +
          <code>/settings/general</code>.
        </li>
      </ul>

      <h2 className="mt-8 text-xl font-bold">Retention</h2>
      <p className="oh-description">
        Active accounts: indefinitely. Deleted accounts: PII removed
        immediately. Audit logs (operationId only): retained for
        diagnostic purposes.
      </p>

      <h2 className="mt-8 text-xl font-bold">Contact</h2>
      <p className="oh-description">
        Questions about this policy? Email <code>privacy@officehours.app</code>.
      </p>
    </article>
  );
}
