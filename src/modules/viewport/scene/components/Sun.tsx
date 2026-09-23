import { useMemo } from "react";
import { Color, SRGBColorSpace } from "three";

import { AXIS_SIGN } from "../../shared/utils/space";
import type { SunColor, SunLight } from "../utils/sunLight";

/** Three's lights are physical since r155, and a Lambert reads them over pi. */
const LAMBERT_UNIT = Math.PI;

/** How far out the sun sits, which a directional light reads for its direction alone. */
const REACH = 10_000;

/**
 * A scene's sun and sky lights, which every lit material in it reads.
 *
 * A map's colours are the bytes its shaders multiply, so they are read as sRGB.
 */
export function Sun({ light }: { readonly light: SunLight }) {
  const [x, y, z] = light.direction;
  const color = useSrgb(light.color);
  const sky = useSrgb(light.sky);
  const ground = useSrgb(light.ground);
  return (
    <>
      <directionalLight
        position={[AXIS_SIGN[0] * x * REACH, AXIS_SIGN[1] * y * REACH, AXIS_SIGN[2] * z * REACH]}
        color={color}
        intensity={light.strength * LAMBERT_UNIT}
      />
      <hemisphereLight color={sky} groundColor={ground} intensity={light.ambient * LAMBERT_UNIT} />
    </>
  );
}

function useSrgb([r, g, b]: SunColor): Color {
  return useMemo(() => new Color().setRGB(r, g, b, SRGBColorSpace), [r, g, b]);
}
