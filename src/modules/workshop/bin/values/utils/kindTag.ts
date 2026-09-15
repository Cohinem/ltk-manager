import type { BinRow, BinValue, KindShape, PropertyKind } from "@/lib/tauri";

/**
 * The tag a shape draws, the way the meta wiki writes a type: the kind, and what it
 * holds in brackets.
 *
 * `list[embed]`, `map[hash,string]`, `option[f32]`, and `string` for a leaf.
 */
export function shapeTag(shape: KindShape): string {
  const { kind, key, value } = shape;
  if (value === null) return kind;
  if (key === null) return `${kind}[${value}]`;
  return `${kind}[${key},${value}]`;
}

/** The shape of a row's value: its kind, and the kinds its value declares for what it holds. */
export function rowShape(kind: PropertyKind, value: BinValue): KindShape {
  switch (value.type) {
    case "container":
    case "optional":
      return { kind, key: null, value: value.itemKind };
    case "map":
      return { kind, key: value.keyKind, value: value.valueKind };
    default:
      return { kind, key: null, value: null };
  }
}

/** The tag a row draws after its name. Null for an object row, which carries none. */
export function rowTag(row: Pick<BinRow, "kind" | "value">): string | null {
  if (row.kind === null) return null;
  return shapeTag(rowShape(row.kind, row.value));
}
