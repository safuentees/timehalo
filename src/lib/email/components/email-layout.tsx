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

export type OhEmailLayoutProps = {
  preview: string;
  eyebrow?: string;
  heading: string;
  subtitle?: ReactNode;
  children: ReactNode;
  cta?: ReactNode;
  recipientEmail: string;
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
