import { create } from "zustand";

interface LibrarySelectionStore {
  selectedIds: Set<string>;
  /** Visual order of the currently selectable mod ids, used to resolve shift-click ranges. */
  orderedIds: string[];
  /** Id of the last mod picked without shift, the anchor for range selection. */
  anchorId: string | null;
  /**
   * The selection a shift range adds to, held while one anchor stands.
   *
   * Each shift-click redraws the range from the anchor over this base, so a
   * second shift-click moves the range's far end instead of adding a new one.
   */
  rangeBase: Set<string> | null;
  setOrderedIds: (ids: string[]) => void;
  toggle: (id: string) => void;
  /** Make `id` the anchor without picking it, as a bare press in the table does. */
  setAnchor: (id: string | null) => void;
  selectRangeTo: (id: string) => void;
  /** Pick `ids` as the range from the anchor, replacing the range drawn before it. */
  selectRange: (ids: string[]) => void;
  selectOnly: (id: string) => void;
  addMany: (ids: string[]) => void;
  removeMany: (ids: string[]) => void;
  setSelection: (ids: Iterable<string>) => void;
  clear: () => void;
}

export const useLibrarySelectionStore = create<LibrarySelectionStore>()((set, get) => ({
  selectedIds: new Set(),
  orderedIds: [],
  anchorId: null,
  rangeBase: null,
  setOrderedIds: (ids) =>
    set((state) => (sameOrder(state.orderedIds, ids) ? state : { orderedIds: ids })),
  toggle: (id) =>
    set((state) => {
      const next = new Set(state.selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { selectedIds: next, anchorId: id, rangeBase: null };
    }),
  setAnchor: (id) => set({ anchorId: id, rangeBase: null }),
  selectRangeTo: (id) => {
    const { orderedIds, anchorId, selectedIds } = get();
    const from = anchorId === null ? -1 : orderedIds.indexOf(anchorId);
    const to = orderedIds.indexOf(id);

    if (from === -1 || to === -1) {
      set({ selectedIds: new Set(selectedIds).add(id), anchorId: id, rangeBase: null });
      return;
    }

    const [start, end] = from <= to ? [from, to] : [to, from];
    get().selectRange(orderedIds.slice(start, end + 1));
  },
  selectRange: (ids) =>
    set((state) => {
      const base = state.rangeBase ?? state.selectedIds;
      const next = new Set(base);
      for (const id of ids) next.add(id);
      return { selectedIds: next, rangeBase: base };
    }),
  selectOnly: (id) => set({ selectedIds: new Set([id]), anchorId: id, rangeBase: null }),
  addMany: (ids) =>
    set((state) => {
      const next = new Set(state.selectedIds);
      for (const id of ids) next.add(id);
      return { selectedIds: next, rangeBase: null };
    }),
  removeMany: (ids) =>
    set((state) => {
      const next = new Set(state.selectedIds);
      for (const id of ids) next.delete(id);
      return { selectedIds: next, rangeBase: null };
    }),
  setSelection: (ids) => set({ selectedIds: new Set(ids), anchorId: null, rangeBase: null }),
  clear: () => set({ selectedIds: new Set(), anchorId: null, rangeBase: null }),
}));

function sameOrder(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
