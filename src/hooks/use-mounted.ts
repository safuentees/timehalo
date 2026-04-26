import { useSyncExternalStore } from "react";

// Returns `true` after the component has mounted on the client. Returns
// `false` during SSR + the first client render (so server and first
// client paint agree, which keeps useId positions stable across
// hydration). Use this anywhere we'd otherwise reach for
// `useState(false) + useEffect(() => setMounted(true), [])` — that
// pattern triggers the React 19 `react-hooks/set-state-in-effect` ESLint
// rule because setState-in-effect is generally a code smell. The
// useSyncExternalStore form is React's own recommended escape hatch for
// "is this the client yet" — it bypasses the rule because there's no
// effect at all, and it gives the SSR pass an explicit "false" via the
// server-snapshot argument.
//
// Reference: react.dev/reference/react/useSyncExternalStore (server
// snapshot argument: "Should return an initial snapshot of the data ...
// when the component is server rendered").

export function useMounted(): boolean {
  return useSyncExternalStore(
    // No subscription needed — the value never changes after mount.
    // The function shape is required by the API; () => () => {} is
    // the canonical no-op subscribe.
    subscribeNoop,
    // Client snapshot: we're mounted.
    () => true,
    // Server snapshot: not yet.
    () => false,
  );
}

// Hoisted out of useMounted so the reference is stable across renders.
// Passing a fresh function on every call breaks useSyncExternalStore's
// internal caching and forces re-subscription on each render.
function subscribeNoop() {
  return () => {};
}
