import { useEffect, useRef } from "react";

import type { RowReveal } from "../state/indexBrowser";

/**
 * Land `reveal` on its row once the listing that holds it arrives.
 *
 * The row lands at its first appearance in `rows`, through `land`. An id no row carries
 * settles once no row is still loading. Either way `onRevealed` hears the token once.
 */
export function useTreeReveal<Row extends { node: { id: string; type: string } }>(
  rows: readonly Row[],
  reveal: RowReveal | null,
  land: (index: number) => void,
  onRevealed?: (token: number) => void,
): void {
  const revealed = useRef<number | null>(null);

  useEffect(() => {
    if (reveal === null || revealed.current === reveal.token) return;

    const index = rows.findIndex((row) => row.node.id === reveal.id);
    if (index < 0 && rows.some((row) => row.node.type === "loading")) return;

    revealed.current = reveal.token;
    if (index >= 0) land(index);
    onRevealed?.(reveal.token);
  }, [reveal, rows, land, onRevealed]);
}
