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

export type BookingReminderProps = {
  hostName: string;
  visitorName: string;
  slotStartIso: string;
  confirmationUrl: string;
};

export function bookingReminderSubject(props: BookingReminderProps): string {
  return `Starting in 1 hour — ${props.hostName}`;
}

export default function BookingReminderEmail(props: BookingReminderProps) {
  const dt = new Date(props.slotStartIso);
  const slotLine = formatSlot(dt);

  return (
    <Html>
      <Head />
      <Preview>
        Your slot with {props.hostName} starts in 1 hour ({slotLine}).
      </Preview>
      <Body style={body}>
        <Container style={container}>
          <Text style={metaLabel}>Officehours / Reminder</Text>
          <Heading as="h1" style={heading}>
            Starts in 1 hour.
          </Heading>
          <Text style={paragraph}>
            Hi {props.visitorName} — your booking with{" "}
            <strong>{props.hostName}</strong> begins shortly.
          </Text>

          <Section style={detailBlock}>
            <Text style={detailLine}>{slotLine}</Text>
          </Section>

          <Text style={paragraph}>
            Confirmation page:{" "}
            <a href={props.confirmationUrl} style={link}>
              {props.confirmationUrl}
            </a>
          </Text>

          <Text style={footer}>
            Officehours — small surface, deep stack.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

function formatSlot(d: Date): string {
  const weekday = d.toLocaleDateString("en-US", {
    weekday: "short",
    timeZone: "UTC",
  });
  const month = d.toLocaleDateString("en-US", {
    month: "short",
    timeZone: "UTC",
  });
  const day = d.getUTCDate();
  const hour24 = d.getUTCHours();
  const hour12 = ((hour24 + 11) % 12) + 1;
  const minute = String(d.getUTCMinutes()).padStart(2, "0");
  const suffix = hour24 < 12 ? "AM" : "PM";
  return `${weekday.toUpperCase()} ${month.toUpperCase()} ${day} — ${hour12}:${minute} ${suffix} UTC`;
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

const detailBlock = {
  borderTop: "1.5px solid #cfcfcf",
  paddingTop: "16px",
  marginTop: "16px",
};

const detailLine = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: "16px",
  fontWeight: 800,
  color: "#111",
  margin: 0,
};

const link = {
  color: "#111",
  textDecoration: "underline",
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
