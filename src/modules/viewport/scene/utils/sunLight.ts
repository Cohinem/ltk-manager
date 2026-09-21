import type { MapSun } from "@/lib/tauri";

/** A colour as three channels, each 0 to 1 as a map's bin writes them. */
export type SunColor = readonly [number, number, number];

/**
 * The sun and sky lights of a scene, in the viewport's own terms.
 *
 * `strength` and `ambient` are shares of the light, so a white surface facing the sun
 * under a white sky reads at their sum.
 */
export interface SunLight {
  /** Unit length, pointing at the sun in the engine's space. */
  readonly direction: readonly [number, number, number];
  readonly color: SunColor;
  readonly strength: number;
  /** What the ambient lights a surface facing up with. */
  readonly sky: SunColor;
  /** What the ambient lights a surface facing down with. */
  readonly ground: SunColor;
  readonly ambient: number;
}

/**
 * Summoner's Rift's daylight as the stage has always been lit, for a scene with no map.
 *
 * Off `MapSunProperties` of `Maps/MapGeometry/Map11/Base_SRX`, split 0.4 to 0.6 so a
 * sunlit white albedo reads at one.
 */
export const DEFAULT_SUN: SunLight = {
  direction: unit([-0.25, 0.75, -0.05]) ?? [0, 1, 0],
  color: [1, 1, 1],
  strength: 0.4,
  sky: [1, 1, 1],
  ground: [1, 1, 1],
  ambient: 0.6,
};

/**
 * The light a map's own `MapSunProperties` states.
 *
 * `SunIntensityScale` and `skyLightScale` split the light between sun and sky, scaled to
 * add up to one, because no tone map sits between the frame and the canvas and a map's
 * own scales sum past two. A map that scales both to zero splits it evenly.
 */
export function sunLightOf(sun: MapSun): SunLight {
  const strength = Math.max(sun.intensity ?? 1, 0);
  const ambient = Math.max(sun.skyScale ?? 0, 0);
  const total = strength + ambient;
  return {
    direction: unit(sun.direction) ?? DEFAULT_SUN.direction,
    color: rgb(sun.color),
    strength: total > 0 ? strength / total : 0.5,
    sky: rgb(sun.skyColor),
    ground: rgb(sun.groundColor),
    ambient: total > 0 ? ambient / total : 0.5,
  };
}

/** The sun's bearing off the engine's +Z and its elevation, in degrees. */
export interface SunAngles {
  readonly azimuth: number;
  readonly elevation: number;
}

/** The angles of the sun `direction` points at. */
export function sunAngles(direction: SunLight["direction"]): SunAngles {
  const [x, y, z] = direction;
  return {
    azimuth: degrees(Math.atan2(x, z)),
    elevation: degrees(Math.asin(Math.min(Math.max(y, -1), 1))),
  };
}

/** The unit direction to a sun at `angles`. */
export function sunDirection({ azimuth, elevation }: SunAngles): [number, number, number] {
  const bearing = radians(azimuth);
  const height = radians(elevation);
  return [
    Math.cos(height) * Math.sin(bearing),
    Math.sin(height),
    Math.cos(height) * Math.cos(bearing),
  ];
}

function unit(vector: readonly (number | null)[]): readonly [number, number, number] | null {
  const [x = 0, y = 0, z = 0] = vector.map((value) => value ?? 0);
  const length = Math.hypot(x, y, z);
  return length > 0 ? [x / length, y / length, z / length] : null;
}

function rgb(rgba: readonly (number | null)[]): SunColor {
  const [r = 1, g = 1, b = 1] = rgba.map((value) => value ?? 1);
  return [r, g, b];
}

function degrees(angle: number): number {
  return (angle * 180) / Math.PI;
}

function radians(angle: number): number {
  return (angle * Math.PI) / 180;
}
