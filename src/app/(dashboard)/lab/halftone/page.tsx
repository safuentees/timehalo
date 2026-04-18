import type { Metadata } from "next";
import { HalftoneLab } from "./_components/halftone-lab";

export const metadata: Metadata = {
  title: "Halftone Lab",
  description: "Four-panel WebGL walkthrough of the homepage halftone shader.",
};

export default function Page() {
  return <HalftoneLab />;
}
