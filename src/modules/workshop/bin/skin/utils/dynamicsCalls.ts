import type { NewItem, ValueEdit } from "@/lib/tauri";

import { under } from "./dynamicsEdits";

/**
 * One call a declared document takes for a part of an action, each path relative to the
 * skin's mesh properties.
 *
 * "The colliders" and "Every edit is the document's one command" in
 * docs/plans/pose-dynamics-preview.md. A declared document writes the whole value of the
 * property a call edits, so a call names the narrowest property the action changes.
 */
export type DynamicsCall =
  /** Edit the property `field` of the struct at `holder`, the edits relative to the property. */
  | {
      readonly kind: "property";
      readonly holder: string;
      readonly field: string;
      readonly edits: ValueEdit[];
    }
  /** Put `item` at the end of the list at `list`, which declares as an addition to it. */
  | { readonly kind: "append"; readonly list: string; readonly item: NewItem }
  /** Take the item at `path` out of its list. */
  | { readonly kind: "remove"; readonly path: string };

/** `path` as it reads from `base`, and null for a path that is not `base` or under it. */
function relativeTo(base: string, path: string): string | null {
  if (path === base) return "";
  if (path.startsWith(`${base}.`)) return path.slice(base.length + 1);
  if (path.startsWith(`${base}[`)) return path.slice(base.length);
  return null;
}

/** `edits` as they read from `base`, and null where one of them is outside it. */
function within(base: string, edits: readonly ValueEdit[]): ValueEdit[] | null {
  const moved: ValueEdit[] = [];
  for (const edit of edits) {
    const path = relativeTo(base, edit.path);
    if (path === null) return null;
    moved.push({ ...edit, path });
  }
  return moved;
}

/**
 * The staged edits of one action as the calls a declared document takes for it, and null
 * for edits that name no one property to narrow to.
 *
 * The edits are the ones `dynamicsEdits.ts` stages under the mesh properties: a removal, or
 * a property ensured and then filled. An item that joins a list of the mesh properties
 * that holds items is an addition to that list, and each of its fields is a call of its
 * own, so the items the game ships in the list stay the game's.
 */
export function declaredCalls(edits: readonly ValueEdit[]): DynamicsCall[] | null {
  const [first, second, ...rest] = edits;
  if (first === undefined) return [];
  if (first.type === "removeItem" && edits.length === 1) {
    return [{ kind: "remove", path: first.path }];
  }
  if (first.type !== "ensureProperty") return null;

  const property = under(first.path, first.field);
  const joins =
    first.path === "" &&
    second?.type === "insertItem" &&
    second.path === property &&
    (second.item.index ?? 0) > 0;
  if (!joins) {
    const inner = within(property, edits.slice(1));
    if (inner === null) return null;
    return [
      {
        kind: "property",
        holder: first.path,
        field: first.field,
        edits: inner,
      },
    ];
  }

  const item = `${property}[${second.item.index}]`;
  const calls: DynamicsCall[] = [{ kind: "append", list: property, item: second.item }];
  let open: Extract<DynamicsCall, { kind: "property" }> | null = null;
  for (const edit of rest) {
    if (edit.type === "ensureProperty" && edit.path === item) {
      open = { kind: "property", holder: item, field: edit.field, edits: [] };
      calls.push(open);
      continue;
    }
    if (open === null) return null;

    const path = relativeTo(under(item, open.field), edit.path);
    if (path === null) return null;
    open.edits.push({ ...edit, path });
  }
  return calls;
}
