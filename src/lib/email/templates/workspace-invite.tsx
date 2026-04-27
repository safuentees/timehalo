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

export type WorkspaceInviteProps = {
  workspaceName: string;
  inviterName: string;
  role: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
  acceptUrl: string;
};

export function workspaceInviteSubject(
  props: WorkspaceInviteProps,
): string {
  return `You're invited to ${props.workspaceName} on Officehours`;
}

export default function WorkspaceInviteEmail(props: WorkspaceInviteProps) {
  return (
    <Html>
      <Head />
      <Preview>
        {props.inviterName} invited you to {props.workspaceName} ({props.role}).
      </Preview>
      <Body style={body}>
        <Container style={container}>
          <Text style={metaLabel}>Officehours / Workspace invite</Text>
          <Heading as="h1" style={heading}>
            Workspace invite.
          </Heading>
          <Text style={paragraph}>
            <strong>{props.inviterName}</strong> invited you to join{" "}
            <strong>{props.workspaceName}</strong> as{" "}
            <strong>{props.role}</strong>.
          </Text>

          <Section style={detailBlock}>
            <a href={props.acceptUrl} style={cta}>
              ACCEPT INVITE →
            </a>
          </Section>

          <Text style={small}>
            Or paste this link:{" "}
            <a href={props.acceptUrl} style={link}>
              {props.acceptUrl}
            </a>
          </Text>
          <Text style={small}>
            Link expires in 7 days. If this was unexpected, ignore the
            email — nothing happens until you accept.
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
