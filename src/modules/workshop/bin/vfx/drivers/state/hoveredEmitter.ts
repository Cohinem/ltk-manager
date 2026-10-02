import { create } from "zustand";

/** An emitter of an opened system, by its list and its place in it. */
export interface EmitterKey {
  readonly entry: string;
  readonly simple: boolean;
  readonly listIndex: number;
}

interface HoveredEmitterStore {
  /** The emitter under the pointer in the Graph pane, which the viewport lights. */
  hovered: EmitterKey | null;
  setHovered: (key: EmitterKey | null) => void;
}

const useHoveredEmitterStore = create<HoveredEmitterStore>()((set) => ({
  hovered: null,
  setHovered: (hovered) => set({ hovered }),
}));

export function useHoveredEmitter(): EmitterKey | null {
  return useHoveredEmitterStore((state) => state.hovered);
}

export function useSetHoveredEmitter(): (key: EmitterKey | null) => void {
  return useHoveredEmitterStore((state) => state.setHovered);
}

/** The emitter a graph node id belongs to: `c3` and every node under it, `c3/...`. */
export function emitterKeyOf(entry: string, id: string): EmitterKey | null {
  const master = /^([cs])(\d+)(?:\/|$)/.exec(id);
  if (master === null) return null;

  return { entry, simple: master[1] === "s", listIndex: Number(master[2]) };
}

/** The master node id of the emitter at `listIndex` of its list. */
export function masterIdOf(simple: boolean, listIndex: number): string {
  return `${simple ? "s" : "c"}${listIndex}`;
}
