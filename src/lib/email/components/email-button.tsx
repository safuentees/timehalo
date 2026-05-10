import { Button } from "@react-email/components";

// Reusable CTA — synthesizes cal.com's `<CallToAction>` (primary +
// secondary variants) with dub.co's pure-black-rounded styling.
// Inside an OhEmailLayout the parent's `<Tailwind>` provides class
// compilation; the inline-style fallback covers any client that
// strips the class attribute mid-flight.

type Variant = "primary" | "secondary";

export function OhEmailButton({
  href,
  children,
  variant = "primary",
}: {
  href: string;
  children: string;
  variant?: Variant;
}) {
  // Inline-style fallback. React-email's `<Button>` already forces
  // table-row layout for client compatibility; we only need to
  // declare the look once here so every CTA across templates
  // matches.
  const base = {
    display: "inline-block" as const,
    borderRadius: "6px",
    padding: "12px 24px",
    fontSize: "14px",
    fontWeight: 600,
    lineHeight: "20px",
    textDecoration: "none",
  };
  const styles =
    variant === "secondary"
      ? {
          ...base,
          background: "#ffffff",
          color: "#0a0a0a",
          border: "1px solid #d4cdb9",
        }
      : {
          ...base,
          background: "#0a0a0a",
          color: "#ffffff",
        };

  return (
    <Button href={href} style={styles}>
      {children}
    </Button>
  );
}
