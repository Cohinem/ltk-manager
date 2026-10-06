import { create } from "zustand";

import type { BinDocumentId } from "@/lib/tauri";

/** The character host chosen for a particle preview. */
export interface HostChoice {
  /** The skin's object, `0x` and eight hex digits. Empty for no character. */
  readonly skin: string;
  /** The clip's hash. Empty for the bind pose. */
  readonly clip: string;
  /** Seconds into the clip at which the system starts. */
  readonly offset: number;
}

const NO_HOST: HostChoice = { skin: "", clip: "", offset: 0 };

interface HostChoiceStore {
  /** The host chosen for each run, by the key `hostKey` builds. */
  hosts: Record<string, HostChoice>;
}

/**
 * The host of each open particle run. It lasts for the session and is never written to a file.
 *
 * It is a store because two panes read it: the viewport draws the host, and the inspector
 * names it. "The emission source" in docs/ux/BIN_EDITOR.md.
 */
const useHostChoiceStore = create<HostChoiceStore>()(() => ({ hosts: {} }));

/** The key of one run's host: the document id and the system's entry. */
export function hostKey(document: BinDocumentId, system: string): string {
  return `${document}:${system.toLowerCase()}`;
}

export function useHostChoice(key: string): HostChoice {
  return useHostChoiceStore((state) => state.hosts[key] ?? NO_HOST);
}

/** Updates the host of the run under `key` with the fields `patch` sets. */
export function chooseHost(key: string, patch: Partial<HostChoice>): void {
  useHostChoiceStore.setState((state) => ({
    hosts: { ...state.hosts, [key]: { ...(state.hosts[key] ?? NO_HOST), ...patch } },
  }));
}
