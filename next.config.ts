import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin the workspace root explicitly so Next 16's Turbopack stops
  // finding the stray ~/pnpm-lock.yaml in the user's home directory
  // and assuming the workspace lives there. Without this, multi-
  // lockfile warning fires on every `pnpm dev`.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
