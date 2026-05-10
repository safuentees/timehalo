import { Text } from "@react-email/components";
import {
  OhEmailDetailRow,
  OhEmailDivider,
  OhEmailLayout,
  formatSlotLine,
} from "../components";

export type AccountDeletedProps = {
  hostName: string;
  deletedAtIso: string;
  recipientEmail: string;
};

export function accountDeletedSubject(): string {
  return "Your Officehours account was deleted";
}

export default function AccountDeletedEmail(props: AccountDeletedProps) {
  const stamp = formatSlotLine(props.deletedAtIso);
  return (
    <OhEmailLayout
      preview={`Your Officehours account was deleted on ${stamp}`}
      eyebrow="Officehours / Account deleted"
      heading="Account deleted."
      subtitle={
        <>
          Hi {props.hostName} — your Officehours account was deleted. Your
          handle is released, your weekly hours are gone, and any upcoming
          bookings against your page have been cancelled.
        </>
      }
      recipientEmail={props.recipientEmail}
    >
      <OhEmailDivider />
      <OhEmailDetailRow label="Deleted at" value={stamp} />
      <Text className="m-0 mt-4 text-[13px] leading-[1.55] text-ink-muted">
        Booking history is anonymized and retained for audit purposes. If
        this was a mistake, sign up again with the same email — it will not
        restore the prior account.
      </Text>
    </OhEmailLayout>
  );
}
