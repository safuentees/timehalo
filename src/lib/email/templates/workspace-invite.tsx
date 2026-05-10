import { Text } from "@react-email/components";
import {
  OhEmailButton,
  OhEmailDivider,
  OhEmailLayout,
} from "../components";

export type WorkspaceInviteProps = {
  workspaceName: string;
  inviterName: string;
  role: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
  acceptUrl: string;
  recipientEmail: string;
};

export function workspaceInviteSubject(
  props: WorkspaceInviteProps,
): string {
  return `You're invited to ${props.workspaceName} on Officehours`;
}

export default function WorkspaceInviteEmail(props: WorkspaceInviteProps) {
  return (
    <OhEmailLayout
      preview={`${props.inviterName} invited you to ${props.workspaceName} (${props.role}).`}
      eyebrow="Officehours / Workspace invite"
      heading="Workspace invite."
      subtitle={
        <>
          <strong className="font-semibold text-ink">
            {props.inviterName}
          </strong>{" "}
          invited you to join{" "}
          <strong className="font-semibold text-ink">
            {props.workspaceName}
          </strong>{" "}
          as <strong className="font-semibold text-ink">{props.role}</strong>.
        </>
      }
      cta={
        <OhEmailButton href={props.acceptUrl}>Accept invite →</OhEmailButton>
      }
      recipientEmail={props.recipientEmail}
    >
      <OhEmailDivider />
      <Text className="m-0 text-[12px] leading-[1.55] text-ink-muted">
        Or paste this link into your browser:
      </Text>
      <Text className="m-0 mt-1 break-all text-[12px] leading-[1.55] text-ink underline">
        <a href={props.acceptUrl} className="text-ink underline">
          {props.acceptUrl}
        </a>
      </Text>
      <Text className="m-0 mt-4 text-[12px] leading-[1.55] text-ink-muted">
        Link expires in 7 days. If this was unexpected, ignore the email —
        nothing happens until you accept.
      </Text>
    </OhEmailLayout>
  );
}
