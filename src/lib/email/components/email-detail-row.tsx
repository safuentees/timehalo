import { Hr, Section, Text } from "@react-email/components";
import type { ReactNode } from "react";

// Hairline divider — thin paper-tone rule, used between the body
// paragraph and detail blocks (when, where, who, etc.).
export function OhEmailDivider() {
  return (
    <Hr className="mx-0 my-6 border-0 border-t border-solid border-hairline" />
  );
}

// Single detail row — small mono-caps label above a bold mono
// value. Used for slot times, locations, durations, etc. Pairs
// with `<OhEmailDivider>` between adjacent sections.
//
// `value` accepts a ReactNode so callers can compose strong
// emphasis or links inside (e.g. an attached question quote).
export function OhEmailDetailRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <Section className="mb-4">
      <Text className="m-0 mb-1 font-mono text-[10px] font-extrabold uppercase tracking-[2px] text-ink-muted">
        {label}
      </Text>
      <Text className="m-0 font-mono text-[15px] font-bold leading-[1.4] text-ink">
        {value}
      </Text>
    </Section>
  );
}
