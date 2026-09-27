import type { BinRow } from "@/lib/tauri";

/** A holder row for an edit, which reads only the entry and the path. */
export function holderRow(entry: string, path: string): BinRow {
  return {
    entry,
    path,
    label: path,
    node: "property",
    name: path,
    unnamed: true,
    kind: null,
    declared: null,
    value: { type: "undrawn" },
  };
}
