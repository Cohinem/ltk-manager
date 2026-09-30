import type { Geometry } from "../geometry/quads";
import type { PixelRect } from "../layout/solve";
import type { Command, DrawCommand } from "./types";

/**
 * `commands` with each run of draws the client would merge into one icon batch drawn as one, per
 * section 2.4 of docs/plans/atlas-renderer.md: consecutive triangle draws that share the program,
 * the texture, the blend and the scissor, and that no effect drives. A batch keeps its draws'
 * order, so the frame is the same, and it keeps the first draw's element.
 */
export function batchDraws(commands: readonly Command[]): Command[] {
  const batched: Command[] = [];
  /* The batch's own arrays, made once a second draw joins it. */
  let open: { command: DrawCommand; merged: MutableGeometry | null } | null = null;

  const close = () => {
    if (open === null) return;

    batched.push(open.merged === null ? open.command : { ...open.command, geometry: open.merged });
    open = null;
  };

  for (const command of commands) {
    if (command.kind !== "draw" || !batchable(command)) {
      close();
      batched.push(command);
      continue;
    }

    if (open !== null && joins(open.command, command)) {
      open.merged ??= copied(open.command.geometry);
      append(open.merged, command.geometry);
      continue;
    }

    close();
    open = { command, merged: null };
  }
  close();
  return batched;
}

function batchable(command: DrawCommand): boolean {
  return command.effect === null && command.primitive === "triangles";
}

function joins(batch: DrawCommand, next: DrawCommand): boolean {
  return (
    batch.shader === next.shader &&
    batch.texture === next.texture &&
    batch.blend === next.blend &&
    sameRect(batch.scissor, next.scissor)
  );
}

interface MutableGeometry {
  positions: number[];
  colors: number[];
  texcoords: number[];
  indices: number[];
}

function copied(geometry: Geometry): MutableGeometry {
  return {
    positions: [...geometry.positions],
    colors: [...geometry.colors],
    texcoords: [...geometry.texcoords],
    indices: [...geometry.indices],
  };
}

/** `next` after `geometry`, its indices moved past `geometry`'s vertices. */
function append(geometry: MutableGeometry, next: Geometry): void {
  const base = geometry.positions.length / 2;
  geometry.positions.push(...next.positions);
  geometry.colors.push(...next.colors);
  geometry.texcoords.push(...next.texcoords);
  for (const index of next.indices) geometry.indices.push(index + base);
}

function sameRect(a: PixelRect | null, b: PixelRect | null): boolean {
  if (a === null || b === null) return a === b;
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}
