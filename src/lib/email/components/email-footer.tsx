import { Hr, Link, Text } from "@react-email/components";

export function OhEmailFooter({
  recipientEmail,
}: {
  recipientEmail: string;
}) {
  return (
    <>
      <Hr className="mx-0 my-8 border-0 border-t border-solid border-hairline" />
      <Text className="m-0 mb-2 text-[12px] leading-[1.55] text-ink-muted">
        This email was sent to{" "}
        <span className="font-medium text-ink">{recipientEmail}</span>. If you
        weren&apos;t expecting it, you can safely ignore this message.
      </Text>
      <Text className="m-0 text-[12px] leading-[1.55] text-ink-muted">
        Questions?{" "}
        <Link
          href="mailto:support@officehours.app"
          className="text-ink underline"
        >
          support@officehours.app
        </Link>
      </Text>
    </>
  );
}
