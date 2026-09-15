import { AXIS_SIGN } from "../../shared/utils/space";

/**
 * Summoner's Rift's daylight, off `MapSunProperties` of `Maps/MapGeometry/Map11/Base_SRX`.
 *
 * `sunDirection` points at the sun in the engine's space, and the sky, horizon and
 * ground colours are all white at `skyLightScale` one, so the ambient is flat. The split
 * between the two takes `lightMapColorScale` as the ambient's share, which keeps a
 * sunlit white albedo at one rather than past it.
 */
const SUN_DIRECTION: readonly [number, number, number] = [-0.25, 0.75, -0.05];
const AMBIENT_SHARE = 0.6;
const SUN_SHARE = 1 - AMBIENT_SHARE;

/** Three's lights are physical since r155, and a Lambert reads them over pi. */
const LAMBERT_UNIT = Math.PI;

/** How far out the sun sits, which a directional light reads for its direction alone. */
const REACH = 10_000;

/** The map's sun and its flat sky, which every lit material in the scene stands under. */
export function Sun() {
  const [x, y, z] = SUN_DIRECTION;
  return (
    <>
      <directionalLight
        position={[AXIS_SIGN[0] * x * REACH, AXIS_SIGN[1] * y * REACH, AXIS_SIGN[2] * z * REACH]}
        intensity={SUN_SHARE * LAMBERT_UNIT}
      />
      <hemisphereLight intensity={AMBIENT_SHARE * LAMBERT_UNIT} />
    </>
  );
}
