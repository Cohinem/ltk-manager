import type { EmitterModel, SystemModel } from "../../engine/model/model";
import { childPath, childPrefix, MAX_CHILD_DEPTH } from "../../engine/simulation/children";
import { drawRanks, GROUND_ORDER } from "./drawKind";

/** One emitter definition as the viewport draws it, at any depth of the child sets. */
export interface DrawnEmitter {
  /** Unique across the tree, which the emitter's textures and geometry are keyed by. */
  readonly key: string;
  readonly emitter: EmitterModel;
  /** The child path its sources come from, and empty for an emitter of the opened system. */
  readonly path: string;
  /** The index of the opened system's emitter it descends from, which solo narrows to. */
  readonly root: number;
  /**
   * Where it falls in the draw order: the opened system's emitters first, each child's
   * after, and a ground-layer emitter under [`GROUND_ORDER`] before them all.
   */
  readonly rank: number;
}

/** `rank` as the draw order, which a ground-layer emitter takes under the character. */
function orderOf(emitter: EmitterModel, rank: number): number {
  return emitter.groundLayer ? GROUND_ORDER + rank : rank;
}

/**
 * Every emitter the viewport draws: the opened system's, then each child set's in turn.
 *
 * A child reaches the list where a particle of its parent can spawn it: its system was
 * reached, its set names no bones or `posed` says a character is there to spawn them on,
 * and it stands within the depth the simulation caps. Each child ranks after everything
 * listed before it, since a child is a top-level system of its own and the engine sorts
 * emitters within one.
 */
export function drawnEmitters(system: SystemModel, posed = false): DrawnEmitter[] {
  const out: DrawnEmitter[] = [];
  const ranks = drawRanks(system.emitters);
  for (const emitter of system.emitters) {
    out.push({
      key: `${emitter.index}`,
      emitter,
      path: "",
      root: emitter.index,
      rank: orderOf(emitter, ranks.get(emitter.index) ?? 0),
    });
  }
  for (const emitter of system.emitters) collect(out, emitter, "", emitter.index, 1, posed);
  return out;
}

function collect(
  out: DrawnEmitter[],
  parent: EmitterModel,
  prefix: string,
  root: number,
  depth: number,
  posed: boolean,
): void {
  const set = parent.childSet;
  if (set === null || parent.disabled || depth > MAX_CHILD_DEPTH) return;
  if (set.bones.length > 0 && !posed && !parent.mesh?.skinned) return;

  set.children.forEach((child, slot) => {
    if (child === null) return;
    const path = childPath(prefix, parent.index, slot);
    const base = out.length;
    const ranks = drawRanks(child.emitters);
    for (const emitter of child.emitters) {
      out.push({
        key: `${path}:${emitter.index}`,
        emitter,
        path,
        root,
        rank: orderOf(emitter, base + (ranks.get(emitter.index) ?? 0)),
      });
    }
    for (const emitter of child.emitters) {
      collect(out, emitter, childPrefix(path), root, depth + 1, posed);
    }
  });
}
