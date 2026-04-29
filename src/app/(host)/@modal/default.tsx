// Default fallback for the @modal parallel slot. Renders nothing
// when no intercepted route matches — i.e. on hard refresh of any
// route that isn't in the slot's tree, this is what fills the slot.
//
// Per Next.js parallel-routes docs: this default is required so
// non-intercepted navigations don't crash on a missing slot value.
export default function Default() {
  return null;
}
