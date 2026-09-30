import type { LeafValue, PropertyEdit, ValueEdit } from "@/lib/tauri";

import { nameHash } from "../../../shared/utils/binHash";
import type { RectFields } from "./rectEdit";

const POSITION = nameHash("Position");
const UI_RECT = nameHash("UIRect");
const RECT_POSITION = nameHash("Position");
const RECT_SIZE = nameHash("Size");
const ANCHORS = nameHash("Anchors");
const ANCHOR = nameHash("Anchor");
const ALIGN = [nameHash("AlignX"), nameHash("AlignY")] as const;
/** `AnchorHierarchy`'s unnamed pivot and margin fields, X then Y, per research section 11. */
const PIVOT = ["0x0a567dbd", "0x09567c2a"] as const;
const MARGINS = ["0xf00a15b2", "0x8ecb313b"] as const;
const LAYER = nameHash("Layer");
const ENABLED = nameHash("Enabled");
const SCENE = nameHash("Scene");
const ELEMENTS = nameHash("Elements");
const LIST_DISPLAY_DIRECTION = nameHash("ListDisplayDirection");
const START_PERCENTAGE = nameHash("StartPercentage");
const FILL_DIRECTION = nameHash("FillDirection");

const ANCHOR_SINGLE = "AnchorSingle";
const ANCHOR_HIERARCHY = "AnchorHierarchy";

type Pair = readonly [number, number];

/** An anchor a re-anchor writes: a point of the screen, or a hierarchy align and pivot. */
export type AnchorChoice =
  | { readonly kind: "single"; readonly anchor: Pair }
  | {
      readonly kind: "hierarchy";
      readonly align: Pair;
      readonly pivot: Pair;
      /** The margins of the axes the align stretches, and null to leave them. */
      readonly margins: readonly [Pair, Pair] | null;
    };

/** A switch of `UiPositionRect`, by its field name. */
export type RectFlag =
  | "IgnoreGlobalScale"
  | "IgnoreSafeZone"
  | "DisableResolutionDownscale"
  | "DisablePixelSnappingX"
  | "DisablePixelSnappingY";

/** The edit that writes what changed from `before` to `after` into the element `key`'s rect. */
export function rectEdit(key: string, before: RectFields, after: RectFields): PropertyEdit | null {
  const edits: ValueEdit[] = [];
  if (!samePair(before.position, after.position)) {
    edits.push(...rectLeaf(RECT_POSITION, after.position));
  }
  if (!samePair(before.size, after.size)) edits.push(...rectLeaf(RECT_SIZE, after.size));

  for (const at of [0, 1] as const) {
    const margin = after.margins?.[at];
    if (margin === undefined || (before.margins !== null && samePair(before.margins[at], margin))) {
      continue;
    }
    edits.push(...anchorLeaf(MARGINS[at], vector(margin)));
  }

  if (edits.length === 0) return null;
  return { entry: key, holder: "", field: POSITION, edits };
}

/** The edit that re-anchors the element `key` and writes the rect that keeps it where it was. */
export function anchorEdit(
  key: string,
  choice: AnchorChoice,
  position: Pair,
  size: Pair,
): PropertyEdit {
  const anchors = segment(ANCHORS);
  const edits: ValueEdit[] = [
    { type: "ensureProperty", path: "", field: ANCHORS },
    {
      type: "replacePointer",
      path: anchors,
      class: choice.kind === "single" ? ANCHOR_SINGLE : ANCHOR_HIERARCHY,
    },
  ];

  if (choice.kind === "single") {
    edits.push(...anchorLeaf(ANCHOR, vector(choice.anchor)));
  } else {
    for (const at of [0, 1] as const) {
      edits.push(
        ...anchorLeaf(ALIGN[at], integer(choice.align[at])),
        ...anchorLeaf(PIVOT[at], integer(choice.pivot[at])),
      );
      const margin = choice.margins?.[at];
      if (margin !== undefined) edits.push(...anchorLeaf(MARGINS[at], vector(margin)));
    }
  }

  edits.push(...rectLeaf(RECT_POSITION, position), ...rectLeaf(RECT_SIZE, size));
  return { entry: key, holder: "", field: POSITION, edits };
}

/** The edit that sets the switch `flag` of the element `key`'s rect. */
export function rectFlagEdit(key: string, flag: RectFlag, value: boolean): PropertyEdit {
  const field = nameHash(flag);
  return {
    entry: key,
    holder: "",
    field: POSITION,
    edits: [
      { type: "ensureProperty", path: "", field },
      { type: "setLeaf", path: segment(field), value: { type: "bool", value } },
    ],
  };
}

/** The edit that sets the element `key`'s `Enabled`. */
export function enabledEdit(key: string, value: boolean): PropertyEdit {
  return leafEdit(key, ENABLED, { type: "bool", value });
}

/** The edit that sets the element or scene `key`'s `Layer`. */
export function layerEdit(key: string, layer: number): PropertyEdit {
  return leafEdit(key, LAYER, integer(Math.max(0, Math.round(layer))));
}

/** A flag of a `UiElementGroupButtonData` or a `UiElementGroupMeterData` the inspector sets. */
export type GroupFlag = "IsEnabled" | "IsActive" | "IsSelected";

/** The edit that sets the button or meter `key`'s `flag`. */
export function groupFlagEdit(key: string, flag: GroupFlag, value: boolean): PropertyEdit {
  return leafEdit(key, nameHash(flag), { type: "bool", value });
}

/** The edit that starts the meter `key` at `fill`, 0 to 1. */
export function meterStartEdit(key: string, fill: number): PropertyEdit {
  return leafEdit(key, START_PERCENTAGE, { type: "float", value: fill });
}

/** The edit that fills the meter `key` from its right edge, or from its left. */
export function meterDirectionEdit(key: string, leftward: boolean): PropertyEdit {
  return leafEdit(key, FILL_DIRECTION, integer(leftward ? 1 : 0));
}

/** The edit that opens the combo box `key`'s list up from its button, or down. */
export function comboDirectionEdit(key: string, upward: boolean): PropertyEdit {
  return leafEdit(key, LIST_DISPLAY_DIRECTION, integer(upward ? 1 : 0));
}

/** The edit that moves the element `key` into the scene `scene`. */
export function sceneEdit(key: string, scene: string): PropertyEdit {
  return leafEdit(key, SCENE, { type: "objectLink", text: scene });
}

/** The edit that takes item `index` out of the group `group`'s `Elements`. */
export function ungroupEdit(group: string, index: number): PropertyEdit {
  return {
    entry: group,
    holder: "",
    field: ELEMENTS,
    edits: [{ type: "removeItem", path: `[${index}]` }],
  };
}

function leafEdit(key: string, field: string, value: LeafValue): PropertyEdit {
  return { entry: key, holder: "", field, edits: [{ type: "setLeaf", path: "", value }] };
}

function rectLeaf(field: string, values: Pair): ValueEdit[] {
  const rect = segment(UI_RECT);
  return [
    { type: "ensureProperty", path: "", field: UI_RECT },
    { type: "ensureProperty", path: rect, field },
    { type: "setLeaf", path: `${rect}.${segment(field)}`, value: vector(values) },
  ];
}

function anchorLeaf(field: string, value: LeafValue): ValueEdit[] {
  const anchors = segment(ANCHORS);
  return [
    { type: "ensureProperty", path: anchors, field },
    { type: "setLeaf", path: `${anchors}.${segment(field)}`, value },
  ];
}

/** A field hash as a path step, its eight digits without `0x`. */
function segment(hash: string): string {
  return hash.slice(2);
}

function vector(values: Pair): LeafValue {
  return { type: "vector", values: [...values] };
}

function integer(value: number): LeafValue {
  return { type: "integer", text: String(value) };
}

function samePair(a: Pair, b: Pair): boolean {
  return a[0] === b[0] && a[1] === b[1];
}
