import { create } from "zustand";

/** Where each list was left scrolled, in px, by the key the list names itself. */
const scrollTops = create<Record<string, number>>()(() => ({}));

/**
 * Read at mount and written back at unmount, so a scroll costs nothing while it
 * happens. Outside React, because a list that re-rendered on its own scroll
 * would spend the scroll twice.
 */
export function keptScrollTop(key: string): number {
  return scrollTops.getState()[key] ?? 0;
}

export function keepScrollTop(key: string, top: number): void {
  scrollTops.setState({ [key]: top });
}
