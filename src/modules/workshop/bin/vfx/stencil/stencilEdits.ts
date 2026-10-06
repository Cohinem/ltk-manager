import type { LeafValue, ValueEdit, VfxValue } from "@/lib/tauri";

import { nameHash } from "../../shared/utils/binHash";
import { BLEND_MODE, STENCIL_MODE, type StencilMode } from "../engine/model/enums";
import { field, nameId } from "../engine/parsing/readValue";
import type { MaskName } from "./maskModel";

/** The emitter fields the stencil controls write, by name. */
export const STENCIL_FIELD = {
  mode: nameHash("stencilMode"),
  ref: nameHash("stencilRef"),
  id: nameHash("StencilReferenceId"),
} as const;

const EMITTER_NAME = nameHash("emitterName");
const PASS = nameHash("pass");
const BLEND = nameHash("blendMode");
const COLOR = nameHash("Color");
const CONSTANT = nameHash("constantValue");
const DYNAMICS = nameHash("dynamics");
const CHILD_SET = nameHash("childParticleSetDefinition");

/** The hash a cleared `StencilReferenceId` is written as. */
const NO_ID = "0x00000000";

/** The least `pass` the field's `i16` takes. */
const LEAST_PASS = -32768;

/** A colour that adds nothing under `AlphaAdd`. */
const BLACK = [0, 0, 0, 1];

function integer(value: number): LeafValue {
  return { type: "integer", text: String(value) };
}

/** The path of the field `hash` of the list item or struct at `parent`. */
function under(parent: string, hash: string): string {
  return `${parent}.${hash.slice(2)}`;
}

/** The edits that write `value` to the field `hash` of the struct at `parent`, adding the field first. */
function write(parent: string, hash: string, value: LeafValue): ValueEdit[] {
  return [
    { type: "ensureProperty", path: parent, field: hash },
    { type: "setLeaf", path: under(parent, hash), value },
  ];
}

/**
 * The edits that write `mode` on the emitter at `index` of its list, under the list's one
 * property.
 */
export function modeEdits(index: number, mode: StencilMode): ValueEdit[] {
  return write(`[${index}]`, STENCIL_FIELD.mode, integer(mode));
}

/**
 * The edits that put the emitter at `index` on `mask`.
 *
 * A numbered mask writes `stencilRef` and clears a `StencilReferenceId` the emitter authors,
 * since the id would replace the number. A named mask writes the id.
 */
export function maskEdits(index: number, mask: MaskName, node: VfxValue | null): ValueEdit[] {
  const item = `[${index}]`;
  if (mask.id !== null) return write(item, STENCIL_FIELD.id, { type: "hash", text: mask.id });

  const named = nameId(field(node, STENCIL_FIELD.id)) !== null;
  return [
    ...write(item, STENCIL_FIELD.ref, integer(mask.ref)),
    ...(named ? write(item, STENCIL_FIELD.id, { type: "hash", text: NO_ID }) : []),
  ];
}

/** The edits that give the emitter at `index` the role `mode` on `mask`, as one undo step. */
export function joinEdits(
  index: number,
  mode: StencilMode,
  mask: MaskName,
  node: VfxValue | null,
): ValueEdit[] {
  return [...modeEdits(index, mode), ...maskEdits(index, mask, node)];
}

/** What `newMaskEdits` reads off the emitter the mask is made from. */
export interface MaskSource {
  /** The emitter's place in its list. */
  readonly index: number;
  /** The emitter as the resolved system reads it. */
  readonly node: VfxValue | null;
  readonly pass: number;
}

/**
 * The edits that copy the source emitter to the place after it as a mask writer named `name`
 * on the reference `ref`, and put the source inside that mask. One undo step.
 *
 * The copy keeps the source's shape, timing and placement. It writes the mask one `pass`
 * before the source and draws black under `AlphaAdd`, which adds no colour. It spawns no
 * child systems.
 */
export function newMaskEdits(source: MaskSource, ref: number, name: string): ValueEdit[] {
  const copy = `[${source.index + 1}]`;
  const color = field(source.node, COLOR);
  const animated = field(color, DYNAMICS)?.type === "struct";
  const spawns = field(source.node, CHILD_SET)?.type === "struct";
  const mask = { id: null, ref };

  const cleared: ValueEdit[] = [];
  if (animated) {
    cleared.push({
      type: "replacePointer",
      path: under(under(copy, COLOR), DYNAMICS),
      class: null,
    });
  }
  if (spawns) {
    cleared.push({ type: "replacePointer", path: under(copy, CHILD_SET), class: null });
  }

  return [
    {
      type: "copyItem",
      from: `[${source.index}]`,
      path: "",
      index: source.index + 1,
      unique: null,
    },
    ...write(copy, EMITTER_NAME, { type: "string", value: name }),
    ...joinEdits(source.index + 1, STENCIL_MODE.writeMask, mask, source.node),
    ...write(copy, PASS, integer(Math.max(LEAST_PASS, source.pass - 1))),
    ...write(copy, BLEND, integer(BLEND_MODE.alphaAdd)),
    { type: "ensureProperty", path: copy, field: COLOR },
    ...write(under(copy, COLOR), CONSTANT, { type: "vector", values: BLACK }),
    ...cleared,
    ...joinEdits(source.index, STENCIL_MODE.testEqual, mask, source.node),
  ];
}
