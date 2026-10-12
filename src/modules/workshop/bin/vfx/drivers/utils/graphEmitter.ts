import type { EmitterModel, SystemModel } from "../../engine/model/model";

/** The id of the Children node under the master node `master`. */
export function childrenIdOf(master: string): string {
  return `${master}/children`;
}

/** The id of the node of the child system at `index` of the set under the master node `master`. */
export function childSystemIdOf(master: string, index: number): string {
  return `${childrenIdOf(master)}[${index}]`;
}

/**
 * The emitter a node feeds directly, from its id: a master's id and one field of it.
 *
 * Undefined for a node nested under a struct of the emitter, and for a system the run has
 * not read.
 */
export function emitterOf(system: SystemModel | null, id: string): EmitterModel | undefined {
  const master = /^([cs])(\d+)\/[^/[{]+$/.exec(id);
  if (system === null || master === null) return undefined;

  const simple = master[1] === "s";
  const listIndex = Number(master[2]);
  return system.emitters.find((each) => each.simple === simple && each.listIndex === listIndex);
}
