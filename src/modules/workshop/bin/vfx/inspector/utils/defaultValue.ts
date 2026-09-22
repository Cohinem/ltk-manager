import type { BinValue, KindShape } from "@/lib/tauri";

/** A schema constructor value in the existing row control's wire shape. */
export function defaultValue(shape: KindShape | null, value: unknown): BinValue | null {
  if (shape === null || value === undefined) {
    return null;
  }

  const { kind } = shape;
  if ((kind === "bool" || kind === "flag") && typeof value === "boolean") {
    return { type: "bool", value };
  }

  if (kind === "f32" && typeof value === "number" && Number.isFinite(value)) {
    return { type: "float", value };
  }

  if (/^[iu](8|16|32|64)$/.test(kind) && typeof value === "number" && Number.isSafeInteger(value)) {
    return { type: "integer", text: String(value) };
  }

  if (kind === "string" && typeof value === "string") {
    return { type: "string", value };
  }

  if (typeof value === "string") {
    if (kind === "hash") {
      return { type: "hash", hash: value, name: null };
    }

    if (kind === "link") {
      return { type: "objectLink", hash: value, name: null };
    }

    if (kind === "file") {
      return { type: "wadChunkLink", hash: value, path: null };
    }
  }

  if (Array.isArray(value)) {
    const count = { vec2: 2, vec3: 3, vec4: 4 }[kind as "vec2" | "vec3" | "vec4"];
    const finite = value.every((cell) => typeof cell === "number" && Number.isFinite(cell));
    if (count !== undefined && value.length === count && finite) {
      return { type: "vector", values: value };
    }

    if (kind === "rgba" && value.length === 4 && finite) {
      const [r, g, b, a] = value;
      return { type: "color", r, g, b, a };
    }

    if (kind === "mtx44") {
      const cells: unknown[] = value.flat();
      if (
        cells.length === 16 &&
        cells.every((cell) => typeof cell === "number" && Number.isFinite(cell))
      ) {
        return { type: "matrix", values: cells as number[] };
      }
    }

    if ((kind === "list" || kind === "list2") && shape.value !== null) {
      return { type: "container", len: value.length, itemKind: shape.value };
    }
  }

  if (kind === "pointer" && value === null) {
    return { type: "null" };
  }

  if (kind === "option" && value === null && shape.value !== null) {
    return { type: "optional", present: false, itemKind: shape.value };
  }

  if (
    kind === "map" &&
    typeof value === "object" &&
    value !== null &&
    shape.key !== null &&
    shape.value !== null
  ) {
    return {
      type: "map",
      len: Object.keys(value).length,
      keyKind: shape.key,
      valueKind: shape.value,
    };
  }

  return null;
}

/** The default JSON remains distinct from an explicitly null constructor value. */
export function parseDefault(json: string | null | undefined): unknown {
  if (json == null) {
    return undefined;
  }

  try {
    return JSON.parse(json);
  } catch {
    return undefined;
  }
}
