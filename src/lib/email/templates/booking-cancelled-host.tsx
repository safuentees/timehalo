import {
  OhEmailDetailRow,
  OhEmailDivider,
  OhEmailLayout,
  formatSlotLine,
} from "../components";

export type BookingCancelledHostProps = {
  hostName: string;
  visitorName: string;
  visitorEmail: string;
  slotStartIso: string;
  /** Recipient address — auto-injected by `sendEmail()`. */
  recipientEmail: string;
};

export function bookingCancelledHostSubject(
  props: BookingCancelledHostProps,
): string {
  return `${props.visitorName} cancelled their booking`;
}

export default function BookingCancelledHostEmail(
  props: BookingCancelledHostProps,
) {
  const slotLine = formatSlotLine(props.slotStartIso);
  return (
    <OhEmailLayout
      preview={`${props.visitorName} cancelled their ${slotLine} booking.`}
      eyebrow="Officehours / Cancellation"
      heading="Slot opened."
      subtitle={
        <>
          Hi {props.hostName} —{" "}
          <strong className="font-semibold text-ink">
            {props.visitorName}
          </strong>{" "}
          cancelled their booking. The slot is now available again.
        </>
      }
      recipientEmail={props.recipientEmail}
    >
      <OhEmailDivider />
      <OhEmailDetailRow label="Was scheduled for" value={slotLine} />
      <OhEmailDetailRow label="Visitor" value={props.visitorEmail} />
    </OhEmailLayout>
  );
}
