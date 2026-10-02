import { toggledIn } from "@/utils";

/** A row a tree is asked to open down to, focus and scroll to. */
export interface RowReveal {
  /** The row's node id, which is what the tree matches on. */
  readonly id: string;
  /** Bumped per request. Two reveals of one row both land. */
  readonly token: number;
}

/** What every browser of an index holds: its tree, its search box and its pending reveal. */
export interface IndexBrowserSlice {
  /** Folders the user has opened in the browse tree, by path. */
  expanded: ReadonlySet<string>;
  toggleExpanded: (path: string) => void;
  /** Open every one of `paths`, for a reveal that walks down to a row. */
  expand: (paths: readonly string[]) => void;
  /** Collapse `path` and every open folder below it. */
  collapseSubtree: (path: string) => void;
  collapseAll: () => void;
  /** What the browser's search box holds. */
  searchPattern: string;
  searchRegex: boolean;
  setSearchPattern: (searchPattern: string) => void;
  setSearchRegex: (searchRegex: boolean) => void;
  /** Folders the user has shut in the search results tree, by path. */
  shutFind: ReadonlySet<string>;
  toggleFind: (path: string) => void;
  /** The last reveal's token, kept past a settle so the next one is newer. */
  revealToken: number;
  /** The pending reveal, or null while none is owed. */
  reveal: RowReveal | null;
  requestReveal: (id: string) => void;
  /** Drop the reveal with `token`. The tree it addressed has answered it. */
  settleReveal: (token: number) => void;
}

/** `set` without `path` and every path `isBelow` puts under it. */
export function withoutSubtree(
  set: ReadonlySet<string>,
  path: string,
  isBelow: (held: string, path: string) => boolean,
): ReadonlySet<string> {
  return new Set([...set].filter((held) => held !== path && !isBelow(held, path)));
}

/** A store's `set`, as the slice writes through it. */
type SliceSet = (
  partial: Partial<IndexBrowserSlice> | ((state: IndexBrowserSlice) => Partial<IndexBrowserSlice>),
) => void;

/**
 * The slice of a browser store every index shares, for the store to spread into its own.
 *
 * `isBelow` says whether one folder path sits under another, which the two indexes spell
 * differently.
 */
export function indexBrowserSlice(
  set: SliceSet,
  isBelow: (held: string, path: string) => boolean,
): IndexBrowserSlice {
  return {
    expanded: new Set(),
    toggleExpanded: (path) => set((state) => ({ expanded: toggledIn(state.expanded, path) })),
    expand: (paths) =>
      set((state) => {
        if (paths.every((path) => state.expanded.has(path))) return state;
        return { expanded: new Set([...state.expanded, ...paths]) };
      }),
    collapseSubtree: (path) =>
      set((state) => {
        const kept = withoutSubtree(state.expanded, path, isBelow);
        if (kept.size === state.expanded.size) return state;
        return { expanded: kept };
      }),
    collapseAll: () => set({ expanded: new Set() }),
    searchPattern: "",
    searchRegex: false,
    setSearchPattern: (searchPattern) => set({ searchPattern }),
    setSearchRegex: (searchRegex) => set({ searchRegex }),
    shutFind: new Set(),
    toggleFind: (path) => set((state) => ({ shutFind: toggledIn(state.shutFind, path) })),
    revealToken: 0,
    reveal: null,
    requestReveal: (id) =>
      set((state) => {
        const token = state.revealToken + 1;
        return { revealToken: token, reveal: { id, token } };
      }),
    settleReveal: (token) =>
      set((state) => (state.reveal?.token === token ? { reveal: null } : state)),
  };
}
