import {
  OhEmailDetailRow,
  OhEmailDivider,
  OhEmailLayout,
  formatSlotLine,
} from "../components";

export type BookingCancelledProps = {
  hostName: string;
  visitorName: string;
  slotStartIso: string;
  recipientEmail: string;
};

export function bookingCancelledSubject(
  props: BookingCancelledProps,
): string {
  return `Booking with ${props.hostName} cancelled`;
}

export default function BookingCancelledEmail(props: BookingCancelledProps) {
  const slotLine = formatSlotLine(props.slotStartIso);
  return (
    <OhEmailLayout
      preview={`Your booking with ${props.hostName} on ${slotLine} was cancelled.`}
      eyebrow="Officehours / Booking cancelled"
      heading="Booking cancelled."
      subtitle={
        <>
          Hi {props.visitorName} — your booking with{" "}
          <strong className="font-semibold text-ink">{props.hostName}</strong>{" "}
          has been cancelled. The slot is open again.
        </>
      }
      recipientEmail={props.recipientEmail}
    >
      <OhEmailDivider />
      <OhEmailDetailRow label="Was scheduled for" value={slotLine} />
    </OhEmailLayout>
  );
}
