import { PlusIcon, XIcon } from "@phosphor-icons/react";
import { Fragment, type ReactNode, use, useMemo } from "react";

import { Button, InputDefaultContext, Tooltip } from "@/components";
import { m } from "@/i18n";
import type { BinDocumentId, BinRow, ValueEdit } from "@/lib/tauri";

import { FieldRow } from "../../../classes/components/ClassCells";
import { useBinRead } from "../../../documents/hooks/useBinRead";
import { nameHash } from "../../../shared/utils/binHash";
import { RowDocumentContext } from "../../../tree/state/rowFold";
import { useHeldRows } from "../../../tree/state/rowRegistry";
import { childCount, rowKey } from "../../../tree/utils/binRows";
import { useValueMarks, ValueMarksContext } from "../../../values/hooks/useValueMarks";
import type { DefaultField } from "../utils/emitterGroups";
import { absentRow } from "./StructFields";

/** Fields of `VfxShapeLegacy` that hold its rotations, angle `i` turning about axis `i`. */
export const ROTATION = {
  angles: nameHash("emitRotationAngles"),
  axes: nameHash("emitRotationAxes"),
} as const;

const CONSTANT = nameHash("constantValue");
const ANGLE_CLASS = "ValueFloat";
const UP = [0, 1, 0];

const NO_ROWS: readonly BinRow[] = [];

function hex(hash: string): string {
  return hash.slice(2);
}

/** Edits of a shape with `angles` angles and `axes` axes that append a turn of 0 about +Y. */
export function addRotationEdits(angles: number, axes: number): ValueEdit[] {
  const angle = `${hex(ROTATION.angles)}[${angles}]`;
  return [
    { type: "ensureProperty", path: "", field: ROTATION.angles },
    {
      type: "insertItem",
      path: hex(ROTATION.angles),
      item: { index: angles, key: null, class: ANGLE_CLASS },
    },
    { type: "ensureProperty", path: angle, field: CONSTANT },
    { type: "setLeaf", path: `${angle}.${hex(CONSTANT)}`, value: { type: "float", value: 0 } },
    { type: "ensureProperty", path: "", field: ROTATION.axes },
    { type: "insertItem", path: hex(ROTATION.axes), item: { index: axes, key: null, class: null } },
    {
      type: "setLeaf",
      path: `${hex(ROTATION.axes)}[${axes}]`,
      value: { type: "vector", values: UP },
    },
  ];
}

/** Edits that remove rotation `index` from each list that holds it. */
export function removeRotationEdits(index: number, angles: number, axes: number): ValueEdit[] {
  const edits: ValueEdit[] = [];
  if (index < angles) edits.push({ type: "removeItem", path: `${hex(ROTATION.angles)}[${index}]` });
  if (index < axes) edits.push({ type: "removeItem", path: `${hex(ROTATION.axes)}[${index}]` });
  return edits;
}

/** The rows of `row`'s items in the file. Empty when `row` is undefined. */
function useItems(document: BinDocumentId, row: BinRow | undefined): readonly BinRow[] {
  const key = row === undefined ? "" : rowKey(row);
  const requests = useMemo(
    () => (row === undefined ? [] : [{ key, rows: childCount(row) }]),
    [row, key],
  );
  return useBinRead(document, requests).get(key)?.rows ?? NO_ROWS;
}

function bare(node: ReactNode): ReactNode {
  return node;
}

export interface ShapeRotationsProps {
  document: BinDocumentId;
  /** The shape struct the lists are fields of. */
  holder: BinRow;
  /** `emitRotationAngles` as the schema declares it. */
  field: DefaultField;
  /** The lists in the file, and undefined for a list the shape leaves out. */
  anglesRow: BinRow | undefined;
  axesRow: BinRow | undefined;
  width: string;
  depth: number;
  owner: string | null;
  /** Applies edits relative to the shape. Null where the document takes no edit. */
  onEdit: ((edits: ValueEdit[]) => void) | null;
  /** Wraps each row, which a graph node uses to draw each row as one of its lines. */
  line?: (row: ReactNode) => ReactNode;
}

/**
 * The rotations of a legacy spawn shape, as one list: an axis row and an angle row per rotation,
 * with Add rotation on the header and a remove button on each angle.
 *
 * "The spawn shape" in docs/ux/BIN_EDITOR.md. `emitRotationAngles` and `emitRotationAxes` are
 * parallel lists, so every add and remove writes both in one edit through `onEdit`. It draws
 * `1 + 2 * count` rows, which `shapeLines` counts for a graph node.
 */
export function ShapeRotations({
  document,
  holder,
  field,
  anglesRow,
  axesRow,
  width,
  depth,
  owner,
  onEdit,
  line = bare,
}: ShapeRotationsProps) {
  const angles = useItems(document, anglesRow);
  const axes = useItems(document, axesRow);
  useHeldRows(angles);
  useHeldRows(axes);
  const own = useValueMarks(document, angles, "curves");
  const outer = use(ValueMarksContext);
  const marks = useMemo(() => new Map([...outer, ...own]), [outer, own]);

  const count = Math.max(angles.length, axes.length);
  const header =
    anglesRow ?? absentRow(holder, field, { type: "container", len: 0, itemKind: "embed" });
  const add = m.workshop_bin_vfx_shape_rotation_add_action();

  return (
    <ValueMarksContext value={marks}>
      {line(
        <InputDefaultContext value={anglesRow === undefined}>
          <RowDocumentContext value={null}>
            <FieldRow
              row={header}
              label={m.workshop_bin_vfx_shape_rotations_label()}
              tableLayout
              width={width}
              depth={depth}
              owner={owner}
              valueSlot={
                <span className="flex items-center gap-2 text-meta text-surface-400">
                  {count === 0 && m.workshop_bin_vfx_shape_rotations_empty()}
                  {onEdit !== null && (
                    <Button
                      variant="ghost"
                      size="xs"
                      left={<PlusIcon weight="bold" />}
                      onClick={(event) => {
                        event.stopPropagation();
                        onEdit(addRotationEdits(angles.length, axes.length));
                      }}
                    >
                      {add}
                    </Button>
                  )}
                </span>
              }
            />
          </RowDocumentContext>
        </InputDefaultContext>,
      )}
      {Array.from({ length: count }, (_, index) => {
        const axis = axes[index];
        const angle = angles[index];
        const remove = m.workshop_bin_vfx_shape_rotation_remove_action({ index: index + 1 });
        const action = onEdit !== null && (
          <Tooltip content={remove}>
            <Button
              variant="ghost"
              size="xs"
              aria-label={remove}
              left={<XIcon weight="bold" />}
              onClick={() => onEdit(removeRotationEdits(index, angles.length, axes.length))}
            />
          </Tooltip>
        );

        /* An item missing from the shorter list keeps its line, so the count stays `2 * count`. */
        return (
          <Fragment key={index}>
            {line(
              <ItemRow
                row={axis}
                label={m.workshop_bin_vfx_shape_rotation_axis_label({ index: index + 1 })}
                width={width}
                depth={depth + 1}
                owner={owner}
                action={angle === undefined ? action : undefined}
              />,
            )}
            {line(
              <ItemRow
                row={angle}
                label={m.workshop_bin_vfx_shape_rotation_angle_label({ index: index + 1 })}
                width={width}
                depth={depth + 1}
                owner={owner}
                action={action}
              />,
            )}
          </Fragment>
        );
      })}
    </ValueMarksContext>
  );
}

/** One item of a rotation list, or an empty line where the shorter list has no item. */
function ItemRow({
  row,
  label,
  width,
  depth,
  owner,
  action,
}: {
  row: BinRow | undefined;
  label: string;
  width: string;
  depth: number;
  owner: string | null;
  action: ReactNode;
}) {
  if (row === undefined) return <span />;

  return (
    <FieldRow
      row={row}
      label={label}
      tableLayout
      width={width}
      depth={depth}
      owner={owner}
      valueAction={action}
    />
  );
}
