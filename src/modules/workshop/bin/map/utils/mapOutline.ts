import type { MapChunk, MapChunkItem } from "@/lib/tauri";

/** What one placeable is known by across a map: its chunk and the key it sits under there. */
export function itemId(chunk: string, key: string): string {
  return `${chunk}/${key}`;
}

/** Whether the placeable under `key` of `chunk` is hidden, by itself or with its whole chunk. */
export function isHidden(hidden: ReadonlySet<string>, chunk: string, key: string): boolean {
  return hidden.has(chunk) || hidden.has(itemId(chunk, key));
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
    }
  | {
      readonly type: "item";
      readonly id: string;
      readonly chunk: MapChunk;
      readonly item: MapChunkItem;
    };

/** The chunk graph flattened to the rows on screen, a closed chunk holding its own alone. */
export function outlineRows(
  chunks: readonly MapChunk[],
  opened: ReadonlySet<string>,
): OutlineRow[] {
  const rows: OutlineRow[] = [];
  for (const chunk of chunks) {
    const open = opened.has(chunk.entry);
    rows.push({ type: "chunk", id: chunk.entry, chunk, open });
    if (!open) continue;
    for (const item of chunk.items) {
      rows.push({ type: "item", id: itemId(chunk.entry, item.key), chunk, item });
    }
  }
  return rows;
}
