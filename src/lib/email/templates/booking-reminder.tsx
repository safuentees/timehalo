import {
  OhEmailButton,
  OhEmailDetailRow,
  OhEmailDivider,
  OhEmailLayout,
  formatSlotLine,
} from "../components";

export type BookingReminderProps = {
  hostName: string;
  visitorName: string;
  slotStartIso: string;
  confirmationUrl: string;
  recipientEmail: string;
};

export function bookingReminderSubject(props: BookingReminderProps): string {
  return `Starting in 1 hour — ${props.hostName}`;
}

export default function BookingReminderEmail(props: BookingReminderProps) {
  const slotLine = formatSlotLine(props.slotStartIso);
  return (
    <OhEmailLayout
      preview={`Your slot with ${props.hostName} starts in 1 hour (${slotLine}).`}
      eyebrow="Officehours / Reminder"
      heading="Starts in 1 hour."
      subtitle={
        <>
          Hi {props.visitorName} — your booking with{" "}
          <strong className="font-semibold text-ink">{props.hostName}</strong>{" "}
          begins shortly.
        </>
      }
      cta={
        <OhEmailButton href={props.confirmationUrl}>
          Open confirmation →
        </OhEmailButton>
      }
      recipientEmail={props.recipientEmail}
    >
      <OhEmailDivider />
      <OhEmailDetailRow label="Starts" value={slotLine} />
    </OhEmailLayout>
  );
}
