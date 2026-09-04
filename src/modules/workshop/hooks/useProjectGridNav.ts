import {
  type FocusEvent,
  type KeyboardEvent,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { create } from "zustand";

import { countColumns, gridStep } from "../utils/gridNav";

interface GridFocusStore {
  /** Counts every request to hand the keyboard to the grid. */
  requests: number;
  /** The last request the grid answered, so a plain remount steals no focus. */
  handled: number;
  request: () => void;
  markHandled: (request: number) => void;
}

const useFocusStore = create<GridFocusStore>()((set) => ({
  requests: 0,
  handled: 0,
  request: () => set((state) => ({ requests: state.requests + 1 })),
  markHandled: (request) => set({ handled: request }),
}));

/**
 * Hands the keyboard to the project grid, from a control outside it.
 *
 * The grid is under the outlet and the bar is over it, so the two meet through
 * this store rather than the DOM. A request made while no grid is mounted
 * stands until one is.
 */
export function useRequestGridFocus(): () => void {
  return useFocusStore((state) => state.request);
}

export interface ProjectGridNavParams {
  /**
   * One key per card, in the order the grid draws them.
   *
   * Compared by content, so a refetch returning the same projects holds the
   * stop where the user left it and a real change returns it to the first card.
   */
  keys: readonly string[];
  /** The keyboard route to what a click on a card does. */
  onOpen: (index: number) => void;
}

export interface ProjectGridNav {
  /** Goes on the element the cards are the direct children of. */
  containerRef: RefObject<HTMLDivElement | null>;
  /** The one card holding the grid's tab stop. */
  focusedIndex: number;
  handleKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  handleFocus: (event: FocusEvent<HTMLDivElement>) => void;
}

/**
 * A roving tab stop over a grid of cards, and the arrows that move it.
 *
 * A card is addressed by its position among the container's children, so a
 * card carries nothing to identify itself with.
 */
export function useProjectGridNav({ keys, onOpen }: ProjectGridNavParams): ProjectGridNav {
  const containerRef = useRef<HTMLDivElement>(null);
  const [focusedIndex, setFocusedIndex] = useState(0);

  const [seen, setSeen] = useState(keys);
  if (!sameKeys(seen, keys)) {
    setSeen(keys);
    setFocusedIndex(0);
  }

  const focusCard = useCallback((index: number) => {
    const card = containerRef.current?.children[index];
    if (card instanceof HTMLElement) card.focus();
  }, []);

  const requests = useFocusStore((state) => state.requests);
  const handled = useFocusStore((state) => state.handled);
  const markHandled = useFocusStore((state) => state.markHandled);

  /* Whichever way the keyboard arrives it lands on the grid's own stop, so a
     hand-off from the bar reaches the same card a Tab would. */
  useEffect(() => {
    if (requests === handled) return;
    markHandled(requests);
    focusCard(focusedIndex);
  }, [requests, handled, markHandled, focusCard, focusedIndex]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const container = containerRef.current;
      if (!container) return;

      const index = indexOfCard(container, event.target);
      if (index < 0) return;

      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onOpen(index);
        return;
      }

      const next = gridStep(event.key, {
        index,
        count: container.children.length,
        columns: countColumns(offsetTops(container)),
      });
      if (next === null) return;

      event.preventDefault();
      setFocusedIndex(next);
      focusCard(next);
    },
    [focusCard, onOpen],
  );

  /* Focus reaches a card the stop is not on whenever something other than the
     arrows put it there - a click, or the browser restoring what it had. */
  const handleFocus = useCallback((event: FocusEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container) return;

    const index = indexOfCard(container, event.target);
    if (index >= 0) setFocusedIndex(index);
  }, []);

  return { containerRef, focusedIndex, handleKeyDown, handleFocus };
}

/** Returns the card's index, or -1 for anything inside one, whose keys are its own. */
function indexOfCard(container: HTMLElement, target: EventTarget): number {
  return Array.from(container.children).indexOf(target as Element);
}

function offsetTops(container: HTMLElement): number[] {
  return Array.from(container.children, (card) => (card as HTMLElement).offsetTop);
}

function sameKeys(a: readonly string[], b: readonly string[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((key, at) => key === b[at]);
}
