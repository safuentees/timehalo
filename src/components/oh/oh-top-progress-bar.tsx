// B.PT84 — Indeterminate top progress affordance, rendered while a
// workspace switch (or any future async-transition) is in flight.
// Pure presentational: the parent owns the visibility flag (typically
// `isPending` from `useTransition`). Renders nothing when off so the
// element never participates in layout / paint while idle.
//
// Why a top bar and not an overlay or skeleton: an overlay over the
// content destroys visual continuity (the user just confirmed they
// want to STAY on this page — the data is what's in flight, not the
// shell), and a skeleton would imply "loading from scratch" which is
// also wrong. The bar mirrors the convention every dashboard
// product (vercel, dub via nprogress, github, linear) trained users
// to read as "page is doing async work in the background."
//
// `aria-live="polite"` + `role="progressbar"` so screen-reader users
// hear "Switching workspace" without an interruption. The label
// prop lets callers override the verbalization for future surfaces.

interface Props {
  visible: boolean;
  label?: string;
}

export function OhTopProgressBar({
  visible,
  label = "Switching workspace",
}: Props) {
  if (!visible) return null;
  return (
    <div
      role="progressbar"
      aria-busy="true"
      aria-live="polite"
      aria-label={label}
      className="oh-progress-bar"
    />
  );
}
