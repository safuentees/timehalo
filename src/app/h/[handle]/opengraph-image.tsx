import { ImageResponse } from "next/og";
import { createPublicSSRHelper } from "@/trpc/server-helpers";

export const runtime = "edge";
export const alt = "Host profile on Officehours";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage({
  params,
}: {
  params: { handle: string };
}) {
  const { handle } = params;

  let displayName = `@${handle}`;
  try {
    const trpc = await createPublicSSRHelper();
    const user = await trpc.users.getByHandle.fetch({ handle });
    displayName = user.name ?? `@${handle}`;
  } catch {
  }

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#eee7d5",
          color: "#0a0a0a",
          padding: "80px",
          justifyContent: "space-between",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            fontSize: "22px",
            fontWeight: 800,
            letterSpacing: "3px",
            textTransform: "uppercase",
            opacity: 0.55,
          }}
        >
          <span
            style={{
              display: "inline-block",
              width: "12px",
              height: "12px",
              borderRadius: "999px",
              background: "#0a0a0a",
            }}
          />
          Officehours
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "16px",
          }}
        >
          <div
            style={{
              fontSize: "112px",
              fontWeight: 700,
              lineHeight: 0.95,
              letterSpacing: "-3px",
            }}
          >
            {displayName}
          </div>
          <div
            style={{
              fontSize: "32px",
              opacity: 0.55,
            }}
          >
            officehours.app/h/{handle}
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}
