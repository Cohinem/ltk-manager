import type { AbilityRecipe } from "./abilityRecipe";

type Point = [number, number, number];

/** Ground-plane outlines in engine coordinates, with a full cone opening angle. */
export function guideLines(
  guides: NonNullable<AbilityRecipe["guides"]>,
  target: readonly number[],
): Point[][] {
  const lines: Point[][] = [];
  const arc = (x: number, z: number, radius: number, start: number, sweep: number): Point[] =>
    Array.from({ length: 65 }, (_, index) => {
      const angle = start + (sweep * index) / 64;
      return [x + radius * Math.cos(angle), 1, z + radius * Math.sin(angle)];
    });
  if (guides.range > 0) lines.push(arc(0, 0, guides.range, 0, Math.PI * 2));
  for (const radius of [guides.radius, guides.secondaryRadius])
    if (radius > 0) lines.push(arc(target[0], target[2], radius, 0, Math.PI * 2));
  if (guides.coneAngle > 0 && guides.coneDistance > 0) {
    const sweep = (guides.coneAngle * Math.PI) / 180;
    const facing = Math.atan2(target[2], target[0]);
    lines.push([
      [0, 1, 0],
      ...arc(0, 0, guides.coneDistance, facing - sweep / 2, sweep),
      [0, 1, 0],
    ]);
  }
  return lines;
}
