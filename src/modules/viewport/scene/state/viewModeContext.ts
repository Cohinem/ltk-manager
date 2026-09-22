import { createContext, use } from "react";
import { Color } from "three";

import type { ViewMode } from "../utils/viewMode";

/** The view mode a viewport draws its meshes in, and the colour its edges take. */
export interface ViewModeState {
  readonly mode: ViewMode;
  readonly edgeColour: Color;
}

/** The view mode of the enclosing viewport, which a character draws its skin under. */
export const ViewModeContext = createContext<ViewModeState>({
  mode: "lit",
  edgeColour: new Color(),
});

/** The view mode of the viewport the caller sits in. */
export function useViewMode(): ViewModeState {
  return use(ViewModeContext);
}
