/** One level of depth, as the guide draws it. Characters, because a row is measured in `ch`. */
export const INDENT = "2ch";

/** Past this depth the indentation stops and the guides stack. */
export const MAX_INDENT_DEPTH = 8;

/** The narrowest the name column goes, so a shallow list is not cramped. */
const MIN_NAME_COLS = 22;

/** The widest, so one long name cannot push every value off the pane. */
const MAX_NAME_COLS = 52;

/** The CSS variable that holds the width of the name column in characters. */
export const NAME_COLS_VAR = "--row-name-cols";

/**
 * Returns the characters that one row needs in the name column: its indent, its name, and each
 * non-empty part after the name with a space before it.
 */
export function rowNameCols(depth: number, name: string, after: readonly string[]): number {
  const parts = after.filter((part) => part !== "");
  const tail = parts.reduce((sum, part) => sum + part.length + 1, 0);

  return Math.min(depth, MAX_INDENT_DEPTH) * 2 + name.length + tail;
}

/**
 * Returns the width of the name column in characters: the widest of `widths`, held between the
 * narrowest and the widest bounds.
 *
 * One width for the whole list keeps the values in a column. "The property row" in
 * docs/ux/BIN_EDITOR.md.
 */
export function nameColumnCols(widths: Iterable<number>): number {
  let widest = MIN_NAME_COLS;
  for (const width of widths) {
    if (width > widest) widest = width;
  }

  return Math.min(widest, MAX_NAME_COLS);
}
