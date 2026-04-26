import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Apple-style scale-fade on route changes. Next 16's runtime wraps
    // App Router navigations in `document.startViewTransition()` so the
    // browser snapshots the old/new pages and our CSS keyframes in
    // globals.css interpolate between them. Reduced-motion is gated in
    // the same stylesheet.
    viewTransition: true,
  },
};

export default nextConfig;
