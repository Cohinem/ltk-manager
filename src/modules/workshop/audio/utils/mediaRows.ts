import type { MediaRow } from "@/lib/tauri";

/** A column of the media table that sorts. */
export type MediaSortKey = "source" | "duration" | "size";

/** The order of the media table, or `null` for the order of the file. */
export interface MediaSort {
  readonly key: MediaSortKey;
  readonly descending: boolean;
}

/* The `wFormatTag` values of the Wwise codecs, as `WemCodec` in `ltk_wwise` names them. */
const CODEC_NAMES: Readonly<Record<number, string>> = {
  0x0001: "PCM",
  0x0002: "ADPCM",
  0x3040: "Opus",
  0x3041: "Opus",
  0xfffe: "PCM",
  0xffff: "Vorbis",
};

/** Returns the name of the codec `tag`, or the tag in hex if Wwise has no name for it. */
export function codecLabel(tag: number): string {
  return CODEC_NAMES[tag] ?? `0x${tag.toString(16).padStart(4, "0")}`;
}

/** Returns `seconds` as `m:ss.cc`, the length a media table compares. */
export function formatDuration(seconds: number): string {
  const centiseconds = Math.round(seconds * 100);
  const minutes = Math.floor(centiseconds / 6000);
  const rest = centiseconds % 6000;
  const whole = String(Math.floor(rest / 100)).padStart(2, "0");
  const fraction = String(rest % 100).padStart(2, "0");
  return `${minutes}:${whole}.${fraction}`;
}

/** Returns the rows whose decimal source ID contains `filter`, in their order. */
export function filterRows(rows: readonly MediaRow[], filter: string): readonly MediaRow[] {
  const wanted = filter.trim();
  if (wanted === "") return rows;
  return rows.filter((row) => String(row.sourceId).includes(wanted));
}

/** Returns `rows` in the order `sort` names. A row without a duration sorts last. */
export function sortRows(rows: readonly MediaRow[], sort: MediaSort | null): readonly MediaRow[] {
  if (sort === null) return rows;

  const direction = sort.descending ? -1 : 1;
  const value = (row: MediaRow): number | null => {
    if (sort.key === "source") return row.sourceId;
    if (sort.key === "size") return row.sizeBytes;
    return row.format?.durationSeconds ?? null;
  };

  return [...rows].sort((a, b) => {
    const left = value(a);
    const right = value(b);
    if (left === null || right === null) return (left === null ? 1 : 0) - (right === null ? 1 : 0);
    return (left - right) * direction;
  });
}

/** Returns the sort a press on the header of `key` asks for, after `current`. */
export function nextSort(current: MediaSort | null, key: MediaSortKey): MediaSort | null {
  if (current?.key !== key) return { key, descending: key !== "source" };
  if (current.descending === (key !== "source")) return { key, descending: !current.descending };
  return null;
}

/** Returns the extension that a decoded export of `row` writes: `wav` for PCM, else `ogg`. */
export function decodedExtension(row: MediaRow): "ogg" | "wav" {
  const codec = row.format?.codec;
  return codec === 0x0001 || codec === 0xfffe ? "wav" : "ogg";
}
