import { createContext, use } from "react";
import { Color } from "three";

import type { Edges, ViewMode } from "../utils/viewMode";

/** The view mode a viewport draws its meshes in, the edges it draws, and their colour. */
export interface ViewModeState {
  readonly mode: ViewMode;
  readonly edges: Edges;
  readonly edgeColour: Color;
}

/** The view mode of the enclosing viewport, which a character draws its skin under. */
export const ViewModeContext = createContext<ViewModeState>({
  mode: "lit",
  edges: "none",
  edgeColour: new Color(),
});

/** The view mode of the viewport the caller sits in. */
export function useViewMode(): ViewModeState {
  return use(ViewModeContext);
}
