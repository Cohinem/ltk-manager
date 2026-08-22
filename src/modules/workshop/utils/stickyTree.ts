/**
 * Which ancestor rows a file tree pins above itself as it scrolls, the way an
 * editor's sticky scroll pins the scopes enclosing its top line.
 *
 * Pure, and blind to the row model: a flattened tree is read as depths alone,
 * so the layer file tree and the game source tree each feed it their own rows.
 */

/** All this reads of a flattened tree row. */
export interface DepthRow {
  readonly depth: number;
}

/** One pinned row, placed against the top of the scrollport. */
export interface StickyRow<Row> {
  readonly row: Row;
  /** Where the row sits in the flattened list, so a click can address it. */
  readonly index: number;
  /** Distance from the top of the scrollport, in px. Negative while riding out. */
  readonly top: number;
}

export interface StickyTreeParams<Row> {
  /** How far the rows have scrolled under the pin, in px. */
  readonly scrollTop: number;
  readonly rowHeight: number;
  /** How deep the pin may stack. The outermost rows win past that. */
  readonly max: number;
  /** Whether the row is a directory whose children follow it. */
  readonly isOpenBranch: (row: Row) => boolean;
}

/**
 * Place the directory rows enclosing whatever has scrolled to the top.
 *
 * The band is built in two passes. The first takes the ancestors of the row the
 * scroll has reached. Each of those covers a row of its own, though, so the
 * second walks on down the open directories the band now reaches and pins them
 * in turn - the folder a user scrolls open would otherwise disappear under its
 * own parent. Every pin then rides up as its own files run out, so a nest
 * leaves together instead of blinking away a row at a time.
 */
export function stickyTreeRows<Row extends DepthRow>(
  rows: readonly Row[],
  { scrollTop, rowHeight, max, isOpenBranch }: StickyTreeParams<Row>,
): StickyRow<Row>[] {
  if (rows.length === 0 || max < 1 || rowHeight <= 0 || scrollTop <= 0) return [];

  const first = Math.min(Math.floor(scrollTop / rowHeight), rows.length - 1);
  const pinned = ancestorsOf(rows, first, max);

  /* Whether the band reaches past the top of the row the scroll reached, which
     is what makes that row need a pin of its own. Each pin drops the band's
     edge by exactly the row it takes, so the answer holds for every row after
     it and the test belongs outside the walk. */
  if (first * rowHeight - scrollTop < pinned.length * rowHeight) {
    for (let i = first; pinned.length < max; i += 1) {
      const row = rows[i];
      if (!row || row.depth !== pinned.length || !isOpenBranch(row)) break;
      pinned.push(i);
    }
  }

  const ends = subtreeEnds(rows, pinned, first, max);

  return pinned.map((index, slot) => {
    const end = ends[slot];
    const resting = slot * rowHeight;
    /* The row's last file leaving the band takes the pin up with it, and an
       outer pin cannot ride further than the inner ones it paints over. */
    const top = end === undefined ? resting : Math.min(resting, end * rowHeight - scrollTop);
    return { row: rows[index]!, index, top };
  });
}

/** The directory rows enclosing `index`, outermost first, at most `max` of them. */
function ancestorsOf(rows: readonly DepthRow[], index: number, max: number): number[] {
  const out: number[] = [];
  let want = rows[index]!.depth - 1;
  for (let i = index - 1; i >= 0 && want >= 0; i -= 1) {
    if (rows[i]!.depth === want) {
      out.push(i);
      want -= 1;
    }
  }
  out.reverse();
  /* Trimmed from the inside, so the rows naming the top of the tree are the
     ones that survive a nesting deeper than the band can hold. */
  out.length = Math.min(out.length, max);
  return out;
}

/**
 * The last row each pin holds, or nothing when that lands past the band.
 *
 * Only an end inside the band can move a pin, and the band is `max` rows, so
 * this scans a handful of rows rather than walking a directory of thousands.
 */
function subtreeEnds(
  rows: readonly DepthRow[],
  pinned: readonly number[],
  first: number,
  max: number,
): (number | undefined)[] {
  const ends = new Array<number | undefined>(pinned.length);
  const limit = Math.min(rows.length, first + max + 2);

  let slot = pinned.length - 1;
  /* Past the innermost pin, since every row between there and the scroll is
     held by all of them. */
  for (let i = Math.max(first, pinned[slot] ?? first) + 1; i < limit && slot >= 0; i += 1) {
    while (slot >= 0 && rows[i]!.depth <= rows[pinned[slot]!]!.depth) {
      ends[slot] = i - 1;
      slot -= 1;
    }
  }

  /* The tree itself ran out, so every pin still open ends on its last row. */
  if (limit === rows.length) {
    for (; slot >= 0; slot -= 1) ends[slot] = rows.length - 1;
  }

  return ends;
}
