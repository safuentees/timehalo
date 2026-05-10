// Catch-all for the `@receipt` parallel slot. Returning `null` here
// makes the slot dismiss the receipt modal on ANY client-side
// navigation to a URL that doesn't match the intercepted
// `(.)booked/[bookingUid]` pattern.
//
// Per Next.js parallel-routes docs
// (`nextjs.org/docs/app/api-reference/file-conventions/parallel-
// routes#closing-the-modal`):
//
//   "Since client-side navigations to a route that no longer match
//    the slot will remain visible, we need to match the slot to a
//    route that returns null to close the modal."
//
// `default.tsx` only kicks in on a HARD load of an unmatched route —
// soft `router.push` from inside the receipt (e.g. the Reschedule
// popover navigating to `/h/[handle]?reschedule=<uid>`) keeps the
// last rendered slot visible without this catch-all in place. Adding
// it lets `AnimatePresence` inside `<HostRouteMotionShell>` run the
// receipt's exit animation cleanly, morphing the receipt card back
// to the landing card / forward into the picker modal via the
// shared `layoutId="handle-card"`.
export default function ReceiptCatchAll() {
  return null;
}
