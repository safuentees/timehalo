import { Button } from "@react-email/components";

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
