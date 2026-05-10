import { Text } from "@react-email/components";
import {
  OhEmailButton,
  OhEmailDetailRow,
  OhEmailDivider,
  OhEmailLayout,
  formatSlotLine,
} from "../components";

export type BookingCreatedProps = {
  hostName: string;
  visitorName: string;
  slotStartIso: string;
  question: string | null;
  confirmationUrl: string;
  /** Recipient address — auto-injected by `sendEmail()`. */
  recipientEmail: string;
};

export function bookingCreatedSubject(props: BookingCreatedProps): string {
  return `Booked with ${props.hostName}`;
}

export default function BookingCreatedEmail(props: BookingCreatedProps) {
  const slotLine = formatSlotLine(props.slotStartIso);

  return (
    <OhEmailLayout
      preview={`Booked with ${props.hostName} — ${slotLine}`}
      eyebrow="Officehours / Booking confirmed"
      heading="Slot locked in."
      subtitle={
        <>
          Hi {props.visitorName} — your slot with{" "}
          <strong className="font-semibold text-ink">{props.hostName}</strong>{" "}
          is locked in.
        </>
      }
      cta={
        <OhEmailButton href={props.confirmationUrl}>
          View confirmation →
        </OhEmailButton>
      }
      recipientEmail={props.recipientEmail}
    >
      <OhEmailDivider />
      <OhEmailDetailRow label="When" value={slotLine} />
      {props.question ? (
        <>
          <OhEmailDetailRow
            label="Your question"
            value={
              <span className="font-sans font-normal italic text-[#2a2a2a]">
                &ldquo;{props.question}&rdquo;
              </span>
            }
          />
        </>
      ) : null}
      <Text className="m-0 mt-4 text-[12px] leading-[1.55] text-ink-muted">
        Save the link above — you can review or cancel from there.
      </Text>
    </OhEmailLayout>
  );
}
