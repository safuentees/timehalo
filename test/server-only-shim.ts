// Vitest shim for Next.js's `server-only` package. The real module
// throws at module-load time when bundled for the client, which is
// the wrong behavior for a server-side test process. This empty
// module satisfies the import without enforcing the guard.
export {};
