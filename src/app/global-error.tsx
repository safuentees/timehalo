"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

// Last-resort root error boundary. Fires when even the layout fails
// to render — must include <html>/<body> because the segment that
// would normally provide them just blew up. Keep this minimal: no
// providers, no fonts, no i18n. If we do load extra wrappers here
// they can themselves crash and we lose the fallback.

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          padding: "48px 24px",
          minHeight: "100vh",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          background: "#fff",
          color: "#111",
        }}
      >
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <p
            style={{
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: 2.5,
              textTransform: "uppercase",
              opacity: 0.55,
              margin: 0,
            }}
          >
            Officehours / Fatal
          </p>
          <h1
            style={{
              fontSize: 36,
              fontWeight: 900,
              letterSpacing: "-0.02em",
              margin: "16px 0 0 0",
              textTransform: "uppercase",
            }}
          >
            Something broke at the root.
          </h1>
          <p
            style={{
              fontSize: 15,
              lineHeight: 1.55,
              margin: "16px 0 0 0",
              opacity: 0.75,
            }}
          >
            The application failed to mount. Try reloading, or click
            below.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              marginTop: 24,
              padding: "10px 16px",
              border: "2px solid #111",
              background: "#111",
              color: "#fff",
              fontFamily: "inherit",
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: 2,
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          {error.digest ? (
            <p
              style={{
                marginTop: 24,
                fontSize: 10,
                letterSpacing: 1.5,
                textTransform: "uppercase",
                opacity: 0.55,
              }}
            >
              digest: {error.digest}
            </p>
          ) : null}
        </div>
      </body>
    </html>
  );
}
