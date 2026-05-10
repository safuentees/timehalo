import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Tailwind,
  Text,
} from "@react-email/components";
import type { ReactNode } from "react";
import { OhEmailFooter } from "./email-footer";

// Shared shell for every Officehours transactional email.
// Synthesizes the dub.co + cal.com email-architecture analysis:
//
//   - dub.co: `<Tailwind>` from `@react-email/components` so per-
//     template files use Tailwind classes instead of inline style
//     objects. ~50% less code per file vs the previous duplication.
//   - cal.com: composable shell — every template is just
//     `<OhEmailLayout … >{content}</OhEmailLayout>`. Per-template
//     files drop to 20-40 lines of CONTENT only.
//
// Brand vocabulary mirrors the dashboard chrome that shipped on
// /bookings and /settings:
//   - paper-cream outer body (`#f8f5ec`, very light cream)
//   - white inner card with hairline ink-tone border + 6px radius
//   - JetBrains-Mono-equivalent mono stack for eyebrows + detail
//     rows; system sans for body / heading
//   - ink (`#0a0a0a`) heading + body, soft (`#6b6b6b`) for muted text
//
// `<Tailwind>` compiles utility classes to inline styles at render
// time using react-email's email-safe Tailwind subset (most
// utilities work; flex/grid/transform don't, but we don't need
// them here). Hex values are literal because CSS custom properties
// don't survive most email clients.

export type OhEmailLayoutProps = {
  /** Preview text shown in the inbox row + lock-screen
   *  notifications. ≤140 chars; the first sentence is fine. */
  preview: string;
  /** Tiny mono-caps label above the heading — e.g.
   *  "Officehours / Booking confirmed". Use sparingly; can be
   *  omitted on auth-style emails where the heading speaks for
   *  itself. */
  eyebrow?: string;
  /** Big heading — one short sentence, sentence case. */
  heading: string;
  /** Optional sub-line under the heading (15px body text). */
  subtitle?: ReactNode;
  /** Body content — composed of `<Text>`, `<OhEmailDivider>`,
   *  `<OhEmailDetailRow>`, etc. */
  children: ReactNode;
  /** Optional CTA below the body — typically `<OhEmailButton>`. */
  cta?: ReactNode;
  /** Recipient email — surfaced in the footer's "intended for X"
   *  line so a forwarded copy is self-explanatory. Pass even on
   *  auth emails (they always know the address). */
  recipientEmail: string;
  /** Optional override for the footer note. Defaults to the
   *  standard intended-for-X line. */
  footerSlot?: ReactNode;
};

export function OhEmailLayout({
  preview,
  eyebrow,
  heading,
  subtitle,
  children,
  cta,
  recipientEmail,
  footerSlot,
}: OhEmailLayoutProps) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Tailwind
        config={{
          theme: {
            extend: {
              colors: {
                // Brand palette — literal hex values because CSS
                // custom properties don't survive most email clients
                // (Outlook, some Gmail web variants strip them).
                paper: "#eee7d5",
                ink: "#0a0a0a",
                "ink-muted": "#6b6b6b",
                "ink-subtle": "#9b9b9b",
                hairline: "#e0d8c4",
                border: "#d4cdb9",
              },
              fontFamily: {
                sans: [
                  "-apple-system",
                  "BlinkMacSystemFont",
                  "Segoe UI",
                  "Roboto",
                  "Helvetica",
                  "Arial",
                  "sans-serif",
                ],
                mono: [
                  "ui-monospace",
                  "SFMono-Regular",
                  "Menlo",
                  "Monaco",
                  "monospace",
                ],
              },
            },
          },
        }}
      >
        <Body className="m-0 bg-[#f8f5ec] p-0 font-sans">
          <Container className="mx-auto my-10 max-w-[600px] rounded-md border border-solid border-border bg-white p-10">
            {eyebrow ? (
              <Text className="m-0 mb-2 font-mono text-[11px] font-extrabold uppercase tracking-[2.2px] text-ink-muted">
                {eyebrow}
              </Text>
            ) : null}

            <Heading
              as="h1"
              className="m-0 mb-4 text-[28px] font-extrabold leading-tight tracking-[-0.02em] text-ink"
            >
              {heading}
            </Heading>

            {subtitle ? (
              <Text className="m-0 mb-6 text-[15px] leading-[1.55] text-[#2a2a2a]">
                {subtitle}
              </Text>
            ) : null}

            <Section>{children}</Section>

            {cta ? <Section className="mt-8 mb-2">{cta}</Section> : null}

            {footerSlot ?? <OhEmailFooter recipientEmail={recipientEmail} />}
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
