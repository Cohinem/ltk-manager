import { useRef } from "react";

import { typeAheadMatch, typedText, type TypedText } from "../utils/typeAhead";

/** The modifier and key state of a press that a type-ahead reads. */
interface TypedPress {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
}

/**
 * Returns the key handler of a list's type-ahead, which selects the row that the typed text names.
 *
 * `labels` returns the name of each row in list order, and is read at the key. The handler returns
 * `true` if the press typed into the text, whether or not a row matched.
 */
export function useTypeAhead(
  labels: () => readonly string[],
  selectedIndex: number,
  select: (index: number) => void,
): (press: TypedPress) => boolean {
  const typed = useRef<TypedText | null>(null);

  return (press) => {
    const next = typedText(typed.current, press, performance.now());
    if (next === null) return false;

    typed.current = next;
    const found = typeAheadMatch(labels(), next.text, selectedIndex, { keep: next.keep });
    if (found !== null) select(found);
    return true;
  };
}
