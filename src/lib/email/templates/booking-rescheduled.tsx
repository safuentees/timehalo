import {
  OhEmailButton,
  OhEmailDetailRow,
  OhEmailDivider,
  OhEmailLayout,
  formatSlotLine,
} from "../components";

export type BookingRescheduledProps = {
  hostName: string;
  visitorName: string;
  oldSlotStartIso: string;
  newSlotStartIso: string;
  confirmationUrl: string;
  /** Recipient address — auto-injected by `sendEmail()`. */
  recipientEmail: string;
};

export function bookingRescheduledSubject(
  props: BookingRescheduledProps,
): string {
  return `Booking with ${props.hostName} rescheduled`;
}

export default function BookingRescheduledEmail(
  props: BookingRescheduledProps,
) {
  const oldLine = formatSlotLine(props.oldSlotStartIso);
  const newLine = formatSlotLine(props.newSlotStartIso);

  return (
    <OhEmailLayout
      preview={`Moved to ${newLine} (was ${oldLine})`}
      eyebrow="Officehours / Booking rescheduled"
      heading="Time updated."
      subtitle={
        <>
          Hi {props.visitorName} — your booking with{" "}
          <strong className="font-semibold text-ink">{props.hostName}</strong>{" "}
          moved to a new slot.
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
      <OhEmailDetailRow label="New time" value={newLine} />
      <OhEmailDetailRow
        label="Was"
        value={
          <span className="text-ink-muted line-through">{oldLine}</span>
        }
      />
    </OhEmailLayout>
  );
}
