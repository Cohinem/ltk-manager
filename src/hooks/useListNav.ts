import { type KeyboardEvent, useCallback, useState } from "react";

export interface ListNavParams {
  /**
   * Every index the highlight can land on, in list order.
   *
   * Compared by content rather than by identity, so a caller that rebuilds the
   * array on each render still holds its highlight. A list that really did
   * change returns the highlight to its first stop.
   */
  indices: readonly number[];
  onSelect?: (index: number, event: KeyboardEvent<Element>) => void;
  onCancel?: () => void;
}

export interface ListNav {
  /** The highlighted index, or null while the list holds no stop at all. */
  activeIndex: number | null;
  setActiveIndex: (index: number) => void;
  handleKeyDown: (event: KeyboardEvent<Element>) => void;
}

/**
 * Arrow, enter and escape handling for a listbox the focus never enters.
 *
 * The highlight is state rather than DOM focus, so the caller points
 * `aria-activedescendant` at the active row and leaves the caret in its input.
 * Rows the list draws between its stops - a group header, a count - are simply
 * absent from `indices` and the arrows step over them.
 */
export function useListNav({ indices, onSelect, onCancel }: ListNavParams): ListNav {
  const [activeIndex, setActiveIndex] = useState<number | null>(indices[0] ?? null);

  const [seen, setSeen] = useState(indices);
  if (!sameIndices(seen, indices)) {
    setSeen(indices);
    setActiveIndex(indices[0] ?? null);
  }

  const step = useCallback(
    (delta: number) => {
      if (indices.length === 0) return;
      const at = activeIndex === null ? -1 : indices.indexOf(activeIndex);
      const next = (at + delta + indices.length) % indices.length;
      setActiveIndex(indices[next]!);
    },
    [activeIndex, indices],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<Element>) => {
      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          step(1);
          return;
        case "ArrowUp":
          event.preventDefault();
          step(-1);
          return;
        case "Home":
          event.preventDefault();
          if (indices[0] !== undefined) setActiveIndex(indices[0]);
          return;
        case "End":
          event.preventDefault();
          if (indices.length > 0) setActiveIndex(indices[indices.length - 1]!);
          return;
        case "Enter":
          if (activeIndex === null) return;
          event.preventDefault();
          onSelect?.(activeIndex, event);
          return;
        case "Escape":
          event.preventDefault();
          onCancel?.();
          return;
      }
    },
    [activeIndex, indices, onCancel, onSelect, step],
  );

  return { activeIndex, setActiveIndex, handleKeyDown };
}

function sameIndices(a: readonly number[], b: readonly number[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((value, at) => value === b[at]);
}
