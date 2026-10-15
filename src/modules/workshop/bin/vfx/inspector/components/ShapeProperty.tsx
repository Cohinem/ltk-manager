import { CubeTransparentIcon } from "@phosphor-icons/react";
import { use, useMemo } from "react";

import { IconButton, InputDefaultContext } from "@/components";
import { m } from "@/i18n";
import type { BinDocumentId, BinRow, FieldSchema, ValueEdit } from "@/lib/tauri";
import { usePreviewGizmo, useSetPreviewDisplay } from "@/stores";

import { FieldRow } from "../../../classes/components/ClassCells";
import { useBinRead } from "../../../documents/hooks/useBinRead";
import { nameHash } from "../../../shared/utils/binHash";
import { LeafEditContext } from "../../../tree/hooks/useLeafEdit";
import { RowDocumentContext } from "../../../tree/state/rowFold";
import { childCount, fieldHash, rowKey } from "../../../tree/utils/binRows";
import { VfxRunContext } from "../../playback/state/run";
import { SHAPE_CLASSES } from "../utils/emissionSource";
import { type DefaultField, defaultField } from "../utils/emitterGroups";
import { emitterLabel } from "../utils/emitterLabels";
import { ClassSelect } from "./ClassSelect";
import { DefaultProperty } from "./DefaultProperty";
import { type HeldClass, usePrimitivePick } from "./PrimitivePicker";
import { ROTATION, ShapeRotations } from "./ShapeRotations";
import { absentRow, type FieldSlot, StructFields } from "./StructFields";

const FLAGS_FIELD = nameHash("flags");
const NO_ROWS: readonly BinRow[] = [];

/**
 * Returns `field` as a default row draws it. An absent `VfxShapeVolume.flags` defaults to 0,
 * which the engine reads and the schema does not give.
 */
export function shapeDefault(field: FieldSchema): DefaultField {
  const drawn = defaultField(field);
  if (field.hash !== FLAGS_FIELD || field.defaultValue != null) return drawn;
  return { ...drawn, defaultValue: "0" };
}

/** What the shape's special rows need beyond their slot. */
interface ShapeRows {
  document: BinDocumentId;
  axesRow: BinRow | undefined;
  onEdit: ((edits: ValueEdit[]) => void) | null;
}

/** Draws the rotation lists as one list, and an absent `flags` at 0. */
function shapeField(slot: FieldSlot, { document, axesRow, onEdit }: ShapeRows) {
  const { field, child, holder, owner, width, depth } = slot;
  if (field.hash === ROTATION.axes) return null;
  if (field.hash === ROTATION.angles) {
    return (
      <ShapeRotations
        document={document}
        holder={holder}
        field={defaultField(field)}
        anglesRow={child}
        axesRow={axesRow}
        width={width}
        depth={depth}
        owner={owner}
        onEdit={onEdit}
      />
    );
  }
  if (field.hash !== FLAGS_FIELD || child !== undefined || field.defaultValue != null) {
    return undefined;
  }

  return (
    <DefaultProperty
      field={shapeDefault(field)}
      holder={holder}
      width={width}
      owner={owner}
      depth={depth}
    />
  );
}

/**
 * The emitter's `SpawnShape`, as a picker over the shape classes and the fields of the held one.
 *
 * "The spawn shape" in docs/ux/BIN_EDITOR.md. Every field the class declares draws under it, and
 * a field the file leaves out draws dimmed at its default and writes through on its first edit.
 */
export function ShapeProperty({
  field,
  holder,
  authored,
  width,
  owner,
}: {
  field: DefaultField;
  /** The emitter the shape is a field of. */
  holder: BinRow;
  /** The shape the file holds, and undefined for an emitter that leaves it out. */
  authored?: BinRow;
  width: string;
  owner: string | null;
}) {
  const document = use(RowDocumentContext);
  const held: HeldClass | null = authored?.value.type === "struct" ? authored.value : null;
  const pick = usePrimitivePick(holder, field.hash, held);
  const editProperty = use(LeafEditContext)?.editProperty;
  const onEdit =
    editProperty === undefined
      ? null
      : (edits: ValueEdit[]) => void editProperty(holder, field.hash, edits);
  const label = emitterLabel(field.hash, field.name);
  const row = authored ?? absentRow(holder, field, { type: "null" });
  const key = authored === undefined ? "" : rowKey(authored);
  const requests = useMemo(
    () => (authored === undefined ? [] : [{ key, rows: childCount(authored) }]),
    [authored, key],
  );
  const fields = useBinRead(document ?? 0, requests).get(key)?.rows ?? NO_ROWS;
  const axesRow = fields.find((child) => fieldHash(child.path) === ROTATION.axes);

  return (
    <>
      <InputDefaultContext value={authored === undefined}>
        <RowDocumentContext value={null}>
          <FieldRow
            row={row}
            label={label}
            tableLayout
            width={width}
            owner={owner}
            valueSlot={
              <span className="flex min-w-0 items-center gap-2">
                <ClassSelect
                  held={held}
                  classes={SHAPE_CLASSES}
                  label={label}
                  unsetDescription={m.workshop_bin_vfx_shape_unset_description()}
                  onPick={pick}
                />
                <GizmoButton />
              </span>
            }
          />
        </RowDocumentContext>
      </InputDefaultContext>
      {document !== null && authored !== undefined && held !== null && (
        <StructFields
          document={document}
          row={authored}
          classHash={held.classHash}
          width={width}
          depth={1}
          special={(slot) => shapeField(slot, { document, axesRow, onEdit })}
        />
      )}
    </>
  );
}

/** The switch that draws the open emitter's gizmo in the viewport. Renders nothing without a run. */
function GizmoButton() {
  const running = use(VfxRunContext) !== null;
  const gizmo = usePreviewGizmo();
  const setDisplay = useSetPreviewDisplay();
  if (!running) return null;

  const label = m.workshop_bin_graph_shape_in_view_action();
  return (
    <IconButton
      size="sm"
      aria-label={label}
      title={label}
      pressed={gizmo}
      icon={<CubeTransparentIcon />}
      onClick={(event) => {
        event.stopPropagation();
        setDisplay({ previewGizmo: !gizmo });
      }}
    />
  );
}
