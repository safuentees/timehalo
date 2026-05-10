import { Section, Text } from "@react-email/components";
import { OhEmailLayout } from "../components";

export type RegisterOtpProps = {
  /** The 6-digit code shown prominently in the email body. */
  code: string;
  /** Number of MINUTES until the code expires. Quoted in copy so it
   *  must match the server constant in `src/lib/otp.ts`. */
  expiryMinutes: number;
  /** Display name of the app for header + preview text. */
  appName: string;
  /** Recipient address — auto-injected by `sendEmail()`. */
  recipientEmail: string;
};

export function registerOtpSubject(props: RegisterOtpProps): string {
  // Code in the subject is a known good UX pattern — iOS surfaces
  // it in the lock-screen preview. Subject stays under the 70-char
  // truncation threshold most clients impose.
  return `Your ${props.appName} verification code is ${props.code}`;
}

export default function RegisterOtpEmail(props: RegisterOtpProps) {
  return (
    <OhEmailLayout
      preview={`Your verification code is ${props.code}. Expires in ${props.expiryMinutes} minutes.`}
      eyebrow="Officehours / Verify email"
      heading="Confirm your email."
      subtitle={
        <>
          Use the code below to finish creating your{" "}
          <strong className="font-semibold text-ink">{props.appName}</strong>{" "}
          account. The code expires in {props.expiryMinutes} minutes.
        </>
      }
      recipientEmail={props.recipientEmail}
    >
      {/* Code block — large, mono, generous tracking. user-select on
          so a long-press copy works on mobile. Pattern matches dub's
          `verify-email.tsx` (1:1 in spirit; brand chrome ours). */}
      <Section className="my-6 rounded-md border border-solid border-border bg-paper py-4 text-center">
        <Text className="m-0 select-all font-mono text-[36px] font-extrabold leading-tight tracking-[0.25em] text-ink">
          {props.code}
        </Text>
      </Section>
      <Text className="m-0 text-[12px] leading-[1.55] text-ink-muted">
        If you didn&apos;t request this, ignore the email — nothing happens
        until the code is entered.
      </Text>
    </OhEmailLayout>
  );
}
