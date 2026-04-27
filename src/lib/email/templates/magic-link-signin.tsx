import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

export type MagicLinkSigninProps = {
  signInUrl: string;
  appName: string;
};

export function magicLinkSigninSubject(): string {
  return "Your sign-in link";
}

export default function MagicLinkSigninEmail(props: MagicLinkSigninProps) {
  return (
    <Html>
      <Head />
      <Preview>One-tap sign-in for {props.appName}.</Preview>
      <Body style={body}>
        <Container style={container}>
          <Text style={metaLabel}>Officehours / Sign in</Text>
          <Heading as="h1" style={heading}>
            Tap to sign in.
          </Heading>
          <Text style={paragraph}>
            Click the link below to sign in to {props.appName}. Link
            expires in 24 hours.
          </Text>

          <Section style={detailBlock}>
            <a href={props.signInUrl} style={cta}>
              SIGN IN →
            </a>
          </Section>

          <Text style={small}>
            Or paste this URL:{" "}
            <a href={props.signInUrl} style={link}>
              {props.signInUrl}
            </a>
          </Text>
          <Text style={small}>
            If you did not request this, ignore the email — nothing
            happens until you click.
          </Text>

          <Text style={footer}>
            Officehours — small surface, deep stack.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const body = {
  backgroundColor: "#ffffff",
  fontFamily:
    "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  margin: 0,
  padding: 0,
} as const;

const container = {
  maxWidth: "560px",
  margin: "0 auto",
  padding: "32px 24px",
  border: "2px solid #111",
} as const;

const metaLabel = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: "11px",
  fontWeight: 800,
  letterSpacing: "2.2px",
  textTransform: "uppercase" as const,
  color: "#6b6b6b",
  margin: "0 0 8px 0",
};

const heading = {
  fontSize: "28px",
  fontWeight: 900,
  letterSpacing: "-0.02em",
  margin: "8px 0 24px 0",
  color: "#111",
};

const paragraph = {
  fontSize: "15px",
  lineHeight: 1.55,
  color: "#222",
  margin: "0 0 16px 0",
};

const small = {
  fontSize: "12px",
  lineHeight: 1.5,
  color: "#444",
  margin: "8px 0 0 0",
};

const detailBlock = {
  borderTop: "1.5px solid #cfcfcf",
  paddingTop: "20px",
  marginTop: "16px",
  textAlign: "center" as const,
};

const cta = {
  display: "inline-block",
  background: "#111",
  color: "#fff",
  padding: "12px 20px",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: "12px",
  fontWeight: 800,
  letterSpacing: "2px",
  textDecoration: "none",
};

const link = {
  color: "#111",
  textDecoration: "underline",
  wordBreak: "break-all" as const,
};

const footer = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: "10px",
  fontWeight: 800,
  letterSpacing: "1.5px",
  textTransform: "uppercase" as const,
  color: "#9b9b9b",
  marginTop: "32px",
};
