import type { MapChunk, MapChunkItem, MapItemKind } from "@/lib/tauri";

/** What one placeable is known by across a map: its chunk and the key it sits under there. */
export function itemId(chunk: string, key: string): string {
  return `${chunk}/${key}`;
}

/** Whether the placeable under `key` of `chunk` is hidden, by itself or with its whole chunk. */
export function isHidden(hidden: ReadonlySet<string>, chunk: string, key: string): boolean {
  return hidden.has(chunk) || hidden.has(itemId(chunk, key));
}

/** `0x3a79338f`, the field of a `MapPlaceableContainer` holding each placeable by its key. */
const ITEMS_FIELD = "3a79338f";

/** The property path of the placeable under `key` in its chunk, a hash key's eight digits. */
export function placeablePath(key: string): string {
  return `${ITEMS_FIELD}{${key.slice(2)}}`;
}

/** What a chunk's row reads: the last segment of its name, else its own hash. */
export function chunkLabel(chunk: MapChunk): string {
  const name = chunk.name;
  return name === null ? chunk.entry : name.slice(name.lastIndexOf("/") + 1);
}

/** Whether the scene draws anything for `item`, which is what gives its row an eye. */
export function isDrawn(item: MapChunkItem): boolean {
  return item.kind === "particle" || item.kind === "character";
}

/** One row of the outliner: a chunk, or a placeable of an open one. */
export type OutlineRow =
  | {
      readonly type: "chunk";
      readonly id: string;
      readonly chunk: MapChunk;
      readonly open: boolean;
      /** How many of its placeables the filter keeps, all of them where none is set. */
      readonly shown: number;
    }
  | {
      readonly type: "item";
      readonly id: string;
      readonly chunk: MapChunk;
      readonly item: MapChunkItem;
    };

/** What the outliner narrows to: text a name, class or chunk holds, and the kinds kept. */
export interface OutlineFilter {
  readonly text: string;
  /** The kinds kept, and every kind where empty. */
  readonly kinds: ReadonlySet<MapItemKind>;
}

export const NO_FILTER: OutlineFilter = { text: "", kinds: new Set() };

const NONE_SHUT: ReadonlySet<string> = new Set();

/** Whether `filter` narrows anything. */
export function filtering(filter: OutlineFilter): boolean {
  return filter.text.trim() !== "" || filter.kinds.size > 0;
}

/**
 * The chunk graph flattened to the rows on screen, a closed chunk holding its own alone.
 *
 * Under a filter a chunk keeps the placeables it lets through and is left out with none,
 * and a chunk whose own name matches keeps every placeable of the kinds kept. A filtered
 * chunk is open unless the reader shut it, which `shut` holds, so `opened` is the unfiltered
 * tree's alone.
 */
export function outlineRows(
  chunks: readonly MapChunk[],
  opened: ReadonlySet<string>,
  filter: OutlineFilter = NO_FILTER,
  shut: ReadonlySet<string> = NONE_SHUT,
): OutlineRow[] {
  const narrowed = filtering(filter);
  const rows: OutlineRow[] = [];

  for (const chunk of chunks) {
    const items = narrowed ? keptItems(chunk, filter) : chunk.items;
    if (narrowed && items.length === 0) continue;

    const open = narrowed ? !shut.has(chunk.entry) : opened.has(chunk.entry);
    rows.push({ type: "chunk", id: chunk.entry, chunk, open, shown: items.length });
    if (!open) continue;
    for (const item of items) {
      rows.push({ type: "item", id: itemId(chunk.entry, item.key), chunk, item });
    }
  }
  return rows;
}

/** The placeables of `chunk` that `filter` keeps. */
function keptItems(chunk: MapChunk, filter: OutlineFilter): readonly MapChunkItem[] {
  const text = filter.text.trim().toLowerCase();
  const named = text !== "" && chunkLabel(chunk).toLowerCase().includes(text);
  return chunk.items.filter(
    (item) =>
      (filter.kinds.size === 0 || filter.kinds.has(item.kind)) &&
      (named || text === "" || itemMatches(item, text)),
  );
}

/** One placeable the outliner lists, as the viewport marks and selects it. */
export interface PlacedItem {
  readonly id: string;
  readonly chunk: MapChunk;
  readonly item: MapChunkItem;
}

/** Every placeable `filter` keeps across `chunks`, open or shut in the tree. */
export function placedItems(chunks: readonly MapChunk[], filter: OutlineFilter): PlacedItem[] {
  return chunks.flatMap((chunk) =>
    keptItems(chunk, filter).map((item) => ({ id: itemId(chunk.entry, item.key), chunk, item })),
  );
}

function itemMatches(item: MapChunkItem, text: string): boolean {
  return item.name.toLowerCase().includes(text) || item.class.toLowerCase().includes(text);
}

/** How many placeables of each kind the map holds, in the order the kinds are listed. */
export function kindCounts(chunks: readonly MapChunk[]): ReadonlyMap<MapItemKind, number> {
  const counts = new Map<MapItemKind, number>();
  for (const chunk of chunks) {
    for (const item of chunk.items) counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1);
  }
  return counts;
}
