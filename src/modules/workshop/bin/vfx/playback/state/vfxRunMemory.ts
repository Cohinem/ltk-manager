import { create } from "zustand";

import type { AssetRef, BinDocumentId } from "@/lib/tauri";

import { assetKey } from "../../../../preview/utils/assetRef";
import type { RigChoice } from "../../engine/model/rig";

/** The in and the out a run loops between, in seconds of the run's own phase. */
export interface LoopRange {
  readonly from: number;
  readonly to: number;
}

/**
 * What a particle run keeps for the session once its tab is gone (ADR-0037).
 *
 * The mute and the solo sets travel as lists, so a memory is a plain value a devtool
 * prints. Nothing here reaches disk.
 */
export interface VfxRunMemory {
  readonly seed: number;
  /** The rig chosen for the run, and null for one that picks itself from the system. */
  readonly rig: RigChoice | null;
  readonly speed: number;
  readonly muted: readonly number[];
  readonly soloed: readonly number[];
  readonly loop: LoopRange | null;
  /** The chance every birth reads its tables at, null for a run left to its draws. */
  readonly pinned: number | null;
  /** Seconds into the run the tab left it at, which a tab that reopens it seeks to. */
  readonly playhead: number;
}

interface VfxRunMemoryStore {
  /** Every run kept, by the key `vfxRunKey` builds. */
  runs: Record<string, VfxRunMemory>;
  remember: (key: string, memory: VfxRunMemory) => void;
  forget: (key: string) => void;
}

/**
 * The key one system's run is kept under: the file it was read from and its entry.
 *
 * The backend issues a fresh document id per open, so a file is what a reopened tab
 * finds its run by. A bare id keys a run with no file behind it, which lasts one open.
 */
export function vfxRunKey(source: AssetRef | BinDocumentId, entry: string): string {
  if (typeof source === "number") return `open:${source}:${entry}`;

  const project = source.kind === "layer" ? source.project : "";
  return `${project}:${assetKey(source)}:${entry}`;
}

export const useVfxRunMemoryStore = create<VfxRunMemoryStore>()((set) => ({
  runs: {},
  remember: (key, memory) => set((state) => ({ runs: { ...state.runs, [key]: memory } })),
  forget: (key) =>
    set((state) => {
      if (!(key in state.runs)) return state;
      const runs = { ...state.runs };
      delete runs[key];
      return { runs };
    }),
}));

/** The character a rig handed from a skin rides: the skin, its clip, and how far into it the run starts. */
export interface HostHint {
  /** The skin's object, `0x` and eight hex digits. */
  readonly skin: string;
  /** The clip's hash, and empty for the bind pose. */
  readonly clip: string;
  /** Seconds into the clip the system starts, a particle event's frame. */
  readonly offset: number;
}

interface HandedRigStore {
  /** The rig handed to each system, by its entry in lowercase, until its run takes it. */
  rigs: Record<string, RigChoice>;
  /** The character handed beside a rig, by the same key, until the preview takes it. */
  hosts: Record<string, HostHint>;
}

/**
 * Rigs handed to a system from outside its tab: a template that made it, or a skin or a spell
 * it was opened from. ADR-0057.
 */
export const useHandedRigStore = create<HandedRigStore>()(() => ({ rigs: {}, hosts: {} }));

/**
 * Carry the run of the system `entry` on `rig`, whether its tab is open yet or not, and on
 * the character `host` names where one rides it.
 */
export function handRig(entry: string, rig: RigChoice, host: HostHint | null = null): void {
  const key = entry.toLowerCase();
  useHandedRigStore.setState((state) => {
    const hosts = { ...state.hosts };
    if (host === null) delete hosts[key];
    else hosts[key] = host;
    return { rigs: { ...state.rigs, [key]: rig }, hosts };
  });
}

/** The character handed to the system `entry`'s preview, taken once, and null for none. */
export function takeHandedHost(entry: string): HostHint | null {
  const key = entry.toLowerCase();
  const host = useHandedRigStore.getState().hosts[key] ?? null;
  if (host === null) return null;

  useHandedRigStore.setState((state) => {
    const hosts = { ...state.hosts };
    delete hosts[key];
    return { hosts };
  });
  return host;
}

/** The rig handed to the system `entry`, taken once, and null for none. */
export function takeHandedRig(entry: string): RigChoice | null {
  const key = entry.toLowerCase();
  const rig = useHandedRigStore.getState().rigs[key] ?? null;
  if (rig === null) return null;

  useHandedRigStore.setState((state) => {
    const rigs = { ...state.rigs };
    delete rigs[key];
    return { rigs };
  });
  return rig;
}

/** The memory kept for `key`, read once rather than subscribed to. */
export function rememberedVfxRun(key: string): VfxRunMemory | undefined {
  return useVfxRunMemoryStore.getState().runs[key];
}
