import type { LeafValue, ValueEdit } from "@/lib/tauri";

import { nameHash } from "../../shared/utils/binHash";
import type { LeafEdit } from "../../tree/hooks/useLeafEdit";
import {
  type AuthoredForce,
  type ForceDefinition,
  type ForceProperty,
  type ForceValue,
  forceValue,
} from "./forceModel";

/** An empty field at its game defaults, appended without replacing the other force lists. */
export function addForceEdits(definition: ForceDefinition): ValueEdit[] {
  return [
    { type: "ensurePointer", path: "", class: "VfxFieldCollectionDefinitionData" },
    { type: "ensureProperty", path: "", field: nameHash(definition.list) },
    {
      type: "insertItem",
      path: nameHash(definition.list).slice(2),
      item: { index: null, key: null, class: definition.className },
    },
  ];
}

/** A constant edit leaves the field's dynamics and unknown members untouched. */
export async function commitForceValue(
  edit: LeafEdit,
  force: AuthoredForce,
  property: ForceProperty,
  value: ForceValue,
): Promise<boolean> {
  const held = forceValue(force, property);
  if (!held.valid || !validForceValue(property, value)) {
    return false;
  }

  let leaf: LeafValue;
  if (typeof value === "boolean") {
    leaf = { type: "bool", value };
  } else if (property.shape === "scalar") {
    leaf = { type: "float", value: value[0] };
  } else {
    leaf = { type: "vector", values: [...value] };
  }

  if (held.leaf !== null) {
    return (await edit.commit(held.leaf, { ok: true, leaf })) !== false;
  }

  if (edit.editProperty === undefined) {
    return false;
  }

  const edits: ValueEdit[] = [];
  if (property.animated) {
    edits.push({ type: "ensureProperty", path: "", field: nameHash("constantValue") });
  }
  edits.push({
    type: "setLeaf",
    path: property.animated ? nameHash("constantValue").slice(2) : "",
    value: leaf,
  });

  return edit.editProperty(force.row, nameHash(property.name), edits);
}

/** Finite values of the authored field's exact shape. */
export function validForceValue(property: ForceProperty, value: ForceValue): boolean {
  if (property.shape === "bool") {
    return typeof value === "boolean";
  }

  return (
    typeof value !== "boolean" &&
    value.length === (property.shape === "scalar" ? 1 : 3) &&
    value.every((part) => Number.isFinite(part) && Number.isFinite(Math.fround(part)))
  );
}
