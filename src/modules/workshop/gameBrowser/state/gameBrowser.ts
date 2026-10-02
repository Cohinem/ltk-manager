import { create, useStore } from "zustand";

import type { WadSource } from "@/lib/tauri";
import { toggledIn } from "@/utils";

import { type IndexBrowserSlice, indexBrowserSlice } from "../../shared/state/indexBrowser";
import { useWadSource } from "./wadSource";

interface GameBrowserStore extends IndexBrowserSlice {
  /** Collapse exactly `paths` in the search results tree. */
  setCollapsedFindDirs: (paths: ReadonlySet<string>) => void;
  /** Directories shut in one archive's own tree, by archive name then path. */
  shutWadDirs: Record<string, ReadonlySet<string>>;
  toggleWadDir: (wadName: string, path: string) => void;
  /** Collapse exactly `paths` in one archive's tree. */
  setCollapsedWadDirs: (wadName: string, paths: ReadonlySet<string>) => void;
  /** What the WAD list's box holds. */
  wadFilter: string;
  setWadFilter: (wadFilter: string) => void;
}

/** The shut set of an archive nobody has shut a directory in. */
const NO_SHUT_DIRS: ReadonlySet<string> = new Set();

/**
 * What a game browser is showing, held outside the documents that draw it.
 *
 * The first preview a tree opens splits a group off beside it, and a leaf that
 * gains a split around it remounts everything under it. A document holding its
 * own tree state would therefore lose it on the very double click that opened
 * the file - the tree would shut, the box would empty, the scroll would jump.
 * One store per source across the projects, since every tab of a source browses
 * one install.
 */
const createGameBrowserStore = () =>
  create<GameBrowserStore>()((set) => ({
    ...indexBrowserSlice(set, isBelowDir),
    setCollapsedFindDirs: (paths) => set({ shutFind: new Set(paths) }),
    shutWadDirs: {},
    toggleWadDir: (wadName, path) =>
      set((state) => ({
        shutWadDirs: {
          ...state.shutWadDirs,
          [wadName]: toggledIn(state.shutWadDirs[wadName] ?? NO_SHUT_DIRS, path),
        },
      })),
    setCollapsedWadDirs: (wadName, paths) =>
      set((state) => ({ shutWadDirs: { ...state.shutWadDirs, [wadName]: new Set(paths) } })),
    wadFilter: "",
    setWadFilter: (wadFilter) => set({ wadFilter }),
  }));

const stores: Record<WadSource, ReturnType<typeof createGameBrowserStore>> = {
  game: createGameBrowserStore(),
  lcu: createGameBrowserStore(),
};

/** The game's own browser store, for a caller outside React. */
export const useGameBrowserStore = stores.game;

/** One field of the store of the browser the caller sits in. */
function useBrowserStore<T>(selector: (state: GameBrowserStore) => T): T {
  return useStore(stores[useWadSource()], selector);
}

function isBelowDir(held: string, path: string): boolean {
  return held.startsWith(`${path}/`);
}

export const useExpandedGameDirs = () => useBrowserStore((s) => s.expanded);
export const useToggleGameDir = () => useBrowserStore((s) => s.toggleExpanded);
export const useExpandGameDirs = () => useBrowserStore((s) => s.expand);
export const useCollapseAllGameDirs = () => useBrowserStore((s) => s.collapseAll);
export const useCollapseGameDirTree = () => useBrowserStore((s) => s.collapseSubtree);
export const useGameReveal = () => useBrowserStore((s) => s.reveal);
export const useRequestGameReveal = () => useBrowserStore((s) => s.requestReveal);
export const useSettleGameReveal = () => useBrowserStore((s) => s.settleReveal);
export const useGameSearchPattern = () => useBrowserStore((s) => s.searchPattern);
export const useSetGameSearchPattern = () => useBrowserStore((s) => s.setSearchPattern);
export const useGameSearchRegex = () => useBrowserStore((s) => s.searchRegex);
export const useSetGameSearchRegex = () => useBrowserStore((s) => s.setSearchRegex);
export const useShutFindDirs = () => useBrowserStore((s) => s.shutFind);
export const useToggleFindDir = () => useBrowserStore((s) => s.toggleFind);
export const useSetCollapsedFindDirs = () => useBrowserStore((s) => s.setCollapsedFindDirs);
export const useShutWadDirs = (wadName: string) =>
  useBrowserStore((s) => s.shutWadDirs[wadName] ?? NO_SHUT_DIRS);
export const useToggleWadDir = () => useBrowserStore((s) => s.toggleWadDir);
export const useSetCollapsedWadDirs = () => useBrowserStore((s) => s.setCollapsedWadDirs);
export const useWadFilter = () => useBrowserStore((s) => s.wadFilter);
export const useSetWadFilter = () => useBrowserStore((s) => s.setWadFilter);
