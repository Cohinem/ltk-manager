/** How tall one item row is drawn. */
export type RowDensity = "compact" | "default" | "comfortable";

/** Row height per density, in pixels. */
export const ROW_HEIGHT: Record<RowDensity, number> = {
  compact: 30,
  default: 44,
  comfortable: 64,
};

/** Thumbnail box per row height, at 16:9. */
export const THUMB_SIZE: Record<RowDensity, { width: number; height: number }> = {
  compact: { width: 40, height: 22 },
  default: { width: 60, height: 34 },
  comfortable: { width: 96, height: 54 },
};

export interface ArrangedSort<Field extends string> {
  field: Field;
  direction: "asc" | "desc";
}

/** One column an arranged table can draw. */
export interface ArrangedColumn<
  Id extends string = string,
  Field extends string = string,
  Group extends string = string,
> {
  id: Id;
  /** The header's text. Empty for a column whose header is a control or nothing. */
  header: () => string;
  /** The column's name where the header alone does not say it, as in the Columns list. */
  name: () => string;
  size: number;
  minSize?: number;
  /** Pinned columns stay at their edge, keep their width and cannot be hidden or moved. */
  pin?: "start" | "end";
  /** Stays in view after the pinned start columns on a sideways scroll, wherever it was moved. */
  sticky?: boolean;
  /** Takes the width the other columns leave, so it has no edge to drag. */
  fill?: boolean;
  /** A width the table sets from the row height rather than one the reader drags. */
  fitted?: (density: RowDensity) => number;
  /** A column that cannot be hidden, because the row means nothing without it. */
  required?: boolean;
  align?: "end" | "center";
  sortField?: Field;
  /** The groupings this column's header menu offers. */
  groupBy?: Group[];
}

/** What the picking and keyboard hooks read off a row, whatever else it carries. */
export interface ArrangedRow {
  key: string;
  type: string;
}
