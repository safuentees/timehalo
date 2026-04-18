import { FRAG_A, FRAG_B, FRAG_C } from "@/lib/halftone/shaders";
import type { PanelKey } from "./constants";

export { FRAG_A, FRAG_B, FRAG_C } from "@/lib/halftone/shaders";

export const PANEL_FRAG: Record<PanelKey, string> = {
  A: FRAG_A,
  B: FRAG_B,
  C: FRAG_C,
  D: FRAG_C,
};
