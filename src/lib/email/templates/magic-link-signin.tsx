import { Text } from "@react-email/components";
import {
  OhEmailButton,
  OhEmailDivider,
  OhEmailLayout,
} from "../components";

export type MagicLinkSigninProps = {
  signInUrl: string;
  appName: string;
  recipientEmail: string;
};

export function magicLinkSigninSubject(): string {
  return "Your sign-in link";
}

export default function MagicLinkSigninEmail(props: MagicLinkSigninProps) {
  return (
    <OhEmailLayout
      preview={`One-tap sign-in for ${props.appName}.`}
      eyebrow="Officehours / Sign in"
      heading="Tap to sign in."
      subtitle={
        <>
          Click the link below to sign in to{" "}
          <strong className="font-semibold text-ink">{props.appName}</strong>.
          Link expires in 24 hours.
        </>
      }
      cta={<OhEmailButton href={props.signInUrl}>Sign in →</OhEmailButton>}
      recipientEmail={props.recipientEmail}
    >
      <OhEmailDivider />
      <Text className="m-0 text-[12px] leading-[1.55] text-ink-muted">
        Or paste this URL into your browser:
      </Text>
      <Text className="m-0 mt-1 break-all text-[12px] leading-[1.55] text-ink underline">
        <a href={props.signInUrl} className="text-ink underline">
          {props.signInUrl}
        </a>
      </Text>
    </OhEmailLayout>
  );
}
