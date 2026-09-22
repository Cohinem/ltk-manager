import { createContext, use, useEffect, useMemo } from "react";
import { Color, type ShaderMaterial } from "three";

import { EDGE_OVERLAY_OPACITY, type Edges } from "@/modules/viewport";

import { wireMaterial } from "../utils/materials";

/** Which edges the run draws, and the colour they take. */
export interface Wireframe {
  readonly edges: Edges;
  readonly colour: Color;
}

/** The draw order an edge twin takes past its solid, beyond every rank `drawRanks` hands out. */
export const WIRE_ORDER = 1_000_000;

/** What the system's primitives draw their edges under, which a system outside the shell leaves off. */
export const WireframeContext = createContext<Wireframe>({ edges: "none", colour: new Color() });

/** The edge twin `solid` draws beside, and whether the solid itself still draws. */
export interface Wire {
  readonly material: ShaderMaterial | null;
  readonly shaded: boolean;
}

/** The edge twin the run's wireframe mode asks of any solid, and whether a solid still draws. */
export function useWireTwin(): {
  readonly twinOf: (solid: ShaderMaterial) => ShaderMaterial | null;
  readonly shaded: boolean;
} {
  const { edges, colour } = use(WireframeContext);
  const twinOf = useMemo(
    () => (solid: ShaderMaterial) => {
      if (edges === "none") return null;
      return wireMaterial(solid, colour, edges === "over" ? EDGE_OVERLAY_OPACITY : 1);
    },
    [edges, colour],
  );
  return { twinOf, shaded: edges !== "alone" };
}

/** The edge twin the run's wireframe mode asks of `solid`, "The viewer" in docs/ux/BIN_EDITOR.md. */
export function useWire(solid: ShaderMaterial): Wire {
  const { twinOf, shaded } = useWireTwin();
  const material = useMemo(() => twinOf(solid), [twinOf, solid]);
  useEffect(() => () => material?.dispose(), [material]);
  return { material, shaded };
}
