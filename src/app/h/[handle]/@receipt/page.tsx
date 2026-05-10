// Root match for the `@receipt` parallel slot. Returning `null` here
// dismisses the receipt modal when the URL navigates back to
// `/h/[handle]` (with or without query params, e.g.
// `/h/[handle]?reschedule=<uid>` from the Reschedule popover).
//
// Per Next.js parallel-routes docs
// (`nextjs.org/docs/app/api-reference/file-conventions/parallel-
// routes#closing-the-modal`):
//
//   "When navigating back to the root page, we create a `@auth/page.tsx`
//    component."
//
// Pairs with:
//   - `@receipt/(.)booked/[bookingUid]/page.tsx` — intercepted modal
//   - `@receipt/[...catchAll]/page.tsx`         — non-matching sub-routes
//   - `@receipt/default.tsx`                    — hard-refresh fallback
//
// Without this explicit root match, soft `router.push('/h/[handle]?…')`
// from inside the receipt would leave the modal visible because soft
// navigation does NOT fall through to `default.tsx`. AnimatePresence
// inside `<HostRouteMotionShell>` now runs the receipt's exit
// animation cleanly when the slot returns null, so motion's shared
// `layoutId="handle-card"` morphs receipt → landing card / picker
// modal exactly the same way the X close button does.
export default function ReceiptRoot() {
  return null;
}
