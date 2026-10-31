/** The parts of a row that `rowLanes` reads. */
export interface LaneRow {
  readonly key: string;
  readonly parent: string | null;
}

/** The bracket lanes that one row draws. */
export interface RowLanes {
  /** The key of the row that holds each lane, outermost first. */
  readonly blocks: readonly string[];
  /** `true` for each lane that ends on the row, because the next row is outside its block. */
  readonly ends: readonly boolean[];
}

/**
 * Returns the lanes of each of `rows`, which are in draw order.
 *
 * A row draws one lane per row above it in the tree. A lane ends on the last row of the block of
 * its holder. Per "Lanes" in docs/ux/AUDIO.md.
 */
export function rowLanes(rows: readonly LaneRow[]): RowLanes[] {
  const parents = new Map(rows.map((row) => [row.key, row.parent]));
  const blocks = rows.map((row) => {
    const above: string[] = [];
    let parent = row.parent;
    while (parent !== null) {
      above.unshift(parent);
      parent = parents.get(parent) ?? null;
    }
    return above;
  });

  return blocks.map((own, at) => {
    const next = blocks[at + 1] ?? [];
    return { blocks: own, ends: own.map((block, level) => next[level] !== block) };
  });
}
