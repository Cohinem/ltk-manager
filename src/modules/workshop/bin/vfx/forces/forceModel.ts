import { m } from "@/i18n";
import type { BinRow, VfxValue } from "@/lib/tauri";

import { nameHash } from "../../shared/utils/binHash";
import { field } from "../engine/parsing/readValue";

export type ForceKind = "acceleration" | "attraction" | "noise" | "drag" | "orbital";
export type ForceValue = readonly number[] | boolean;

export interface ForceProperty {
  readonly name: string;
  readonly label: () => string;
  readonly shape: "scalar" | "vector" | "bool";
  readonly animated: boolean;
  readonly fallback: ForceValue;
}

export interface ForceDefinition {
  readonly kind: ForceKind;
  readonly title: () => string;
  readonly className: string;
  readonly list: string;
  readonly properties: readonly ForceProperty[];
}

const position: ForceProperty = {
  name: "Position",
  label: m.workshop_bin_force_center_label,
  shape: "vector",
  animated: true,
  fallback: [0, 0, 0],
};
const radius: ForceProperty = {
  name: "radius",
  label: m.workshop_bin_force_radius_label,
  shape: "scalar",
  animated: true,
  fallback: [0],
};
const local: ForceProperty = {
  name: "isLocalSpace",
  label: m.workshop_bin_force_local_label,
  shape: "bool",
  animated: false,
  fallback: true,
};

/** Field controls and defaults verified at patch 16.18, build 8175716. */
export const FORCE_DEFINITIONS: readonly ForceDefinition[] = [
  {
    kind: "acceleration",
    title: m.workshop_bin_force_acceleration_label,
    className: "VfxFieldAccelerationDefinitionData",
    list: "fieldAccelerationDefinitions",
    properties: [
      {
        name: "acceleration",
        label: m.workshop_bin_force_acceleration_label,
        shape: "vector",
        animated: true,
        fallback: [0, 0, 0],
      },
      local,
    ],
  },
  {
    kind: "attraction",
    title: m.workshop_bin_force_attraction_label,
    className: "VfxFieldAttractionDefinitionData",
    list: "fieldAttractionDefinitions",
    properties: [
      position,
      radius,
      {
        name: "acceleration",
        label: m.workshop_bin_force_acceleration_label,
        shape: "scalar",
        animated: true,
        fallback: [0],
      },
    ],
  },
  {
    kind: "noise",
    title: m.workshop_bin_force_noise_label,
    className: "VfxFieldNoiseDefinitionData",
    list: "fieldNoiseDefinitions",
    properties: [
      position,
      radius,
      {
        name: "frequency",
        label: m.workshop_bin_force_frequency_label,
        shape: "scalar",
        animated: true,
        fallback: [0],
      },
      {
        name: "velocityDelta",
        label: m.workshop_bin_force_velocity_delta_label,
        shape: "scalar",
        animated: true,
        fallback: [0],
      },
      {
        name: "axisFraction",
        label: m.workshop_bin_force_axis_weights_label,
        shape: "vector",
        animated: false,
        fallback: [0, 0, 0],
      },
    ],
  },
  {
    kind: "drag",
    title: m.workshop_bin_force_drag_label,
    className: "VfxFieldDragDefinitionData",
    list: "fieldDragDefinitions",
    properties: [
      position,
      radius,
      {
        name: "strength",
        label: m.workshop_bin_force_strength_label,
        shape: "scalar",
        animated: true,
        fallback: [0],
      },
    ],
  },
  {
    kind: "orbital",
    title: m.workshop_bin_force_orbital_label,
    className: "VfxFieldOrbitalDefinitionData",
    list: "fieldOrbitalDefinitions",
    properties: [
      {
        name: "direction",
        label: m.workshop_bin_force_direction_label,
        shape: "vector",
        animated: true,
        fallback: [0, 1, 0],
      },
      local,
    ],
  },
];

export const FORCE_COLLECTION = nameHash("fieldCollectionDefinition");
export const FORCE_DEFAULT_BUILD = 8175716;

export interface AuthoredForce {
  readonly definition: ForceDefinition;
  readonly index: number;
  readonly emitter: number;
  readonly row: BinRow;
  readonly node: VfxValue;
  readonly key: string;
  readonly supported: boolean;
}

/** Stable wire identities, with list order left unchanged. */
export function authoredForces(
  collection: VfxValue | null,
  parent: BinRow,
  emitter: number,
): AuthoredForce[] {
  return FORCE_DEFINITIONS.flatMap((definition) => {
    const list = field(collection, nameHash(definition.list));
    if (list?.type !== "container") {
      return [];
    }

    const supported = list.items.every(
      (node) => node.type === "struct" && node.classHash === nameHash(definition.className),
    );

    return list.items.map((node, index) => {
      const path = `${parent.path}.${nameHash(definition.list).slice(2)}[${index}]`;
      const row = forceRow(parent.entry, path, definition.className, node, "element");

      return {
        definition,
        index,
        emitter,
        row,
        node,
        key: `${emitter}:${definition.kind}:${index}`,
        supported,
      };
    });
  });
}

/** A known force field's row, used by the curve dock and declaration markers. */
export function forceRow(
  entry: string,
  path: string,
  name: string,
  node: VfxValue,
  kind: BinRow["node"] = "property",
): BinRow {
  let value: BinRow["value"] = { type: "null" };
  if (node.type === "struct") {
    value = {
      type: "struct",
      classHash: node.classHash,
      class: node.class,
      len: node.fields.length,
    };
  } else if (node.type === "number") {
    value = { type: "float", value: node.value };
  } else if (node.type === "vector" || node.type === "bool") {
    value = node;
  }

  return {
    entry,
    path,
    name,
    label: name,
    node: kind,
    unnamed: false,
    kind: null,
    value,
    declared: null,
  };
}

/** The authored constant, without flattening its animation or probability tables. */
export function forceValue(
  force: AuthoredForce,
  property: ForceProperty,
): {
  value: ForceValue;
  authored: boolean;
  valid: boolean;
  row: BinRow | null;
  leaf: BinRow | null;
} {
  const node = field(force.node, nameHash(property.name));
  const path = `${force.row.path}.${nameHash(property.name).slice(2)}`;
  const constant = property.animated ? field(node, nameHash("constantValue")) : node;
  const row = node === null ? null : forceRow(force.row.entry, path, property.name, node);
  const leafPath = property.animated ? `${path}.${nameHash("constantValue").slice(2)}` : path;
  const leaf =
    constant === null ? null : forceRow(force.row.entry, leafPath, property.name, constant);
  let value = property.fallback;
  let valid =
    node === null ||
    !property.animated ||
    (node.type === "struct" &&
      node.classHash === nameHash(property.shape === "scalar" ? "ValueFloat" : "ValueVector3"));

  if (constant !== null) {
    if (property.shape === "bool" && constant.type === "bool") {
      value = constant.value;
    } else if (
      property.shape === "scalar" &&
      constant.type === "number" &&
      constant.value !== null
    ) {
      value = [constant.value];
    } else if (
      property.shape === "vector" &&
      constant.type === "vector" &&
      constant.values.length === 3 &&
      constant.values.every((value): value is number => value !== null)
    ) {
      value = constant.values;
    } else {
      valid = false;
    }
  }
  if (typeof value !== "boolean" && !value.every(Number.isFinite)) {
    valid = false;
  }

  return { value, authored: constant !== null, valid, row, leaf };
}
