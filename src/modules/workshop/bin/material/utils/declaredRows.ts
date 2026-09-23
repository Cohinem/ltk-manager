import type { BinRow, SchemaParam } from "@/lib/tauri";

import { rowKey } from "../../tree/utils/binRows";

/** One row of a material table: a shader declaration, the material's entry for it, or both. */
export interface DeclaredRow<D> {
  readonly key: string;
  readonly name: string;
  /** The material's entry, null where the material leaves the shader default. */
  readonly element: BinRow | null;
  /** The shader's declaration, null for an entry the shader does not declare. */
  readonly declared: D | null;
}

/**
 * The shader's declarations in their order, each with the material's first entry of its name,
 * then every entry no declaration took, in the material's order.
 *
 * Without declarations the rows are the material's entries alone, as the list holds them.
 */
export function declaredRows<D extends { readonly name: string }>(
  elements: readonly BinRow[],
  nameOf: (element: BinRow) => string | undefined,
  declarations: readonly D[] | null,
): DeclaredRow<D>[] {
  const byName = new Map((declarations ?? []).map((declared) => [declared.name, declared]));
  const first = new Map<string, BinRow>();
  for (const element of elements) {
    const name = nameOf(element);
    if (name !== undefined && byName.has(name) && !first.has(name)) first.set(name, element);
  }

  const rows: DeclaredRow<D>[] = (declarations ?? []).map((declared) => {
    const element = first.get(declared.name) ?? null;
    return {
      key: element === null ? `declared:${declared.name}` : rowKey(element),
      name: declared.name,
      element,
      declared,
    };
  });

  const taken = new Set(first.values());
  for (const element of elements) {
    if (taken.has(element)) continue;
    const name = nameOf(element) ?? "";
    rows.push({ key: rowKey(element), name, element, declared: byName.get(name) ?? null });
  }
  return rows;
}

/** How many components a logical parameter's `fields` mask writes. */
export function componentCount(fields: number): number {
  let count = 0;
  for (let bit = 0; bit < 4; bit += 1) {
    if (fields & (1 << bit)) count += 1;
  }
  return count;
}

/** A default's four components. A NaN crosses IPC as null, which the entry then writes as 0. */
export function paramDefault(param: SchemaParam): number[] {
  return param.default.map((value) => value ?? 0);
}
