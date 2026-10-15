import { type ReactNode, use, useMemo } from "react";

import { InputDefaultContext } from "@/components";
import { m } from "@/i18n";
import type { BinRow, ValueEdit } from "@/lib/tauri";
import { twMerge } from "@/utils";

import { useClassSchema } from "../../../classes/hooks/useClassSchema";
import { LeafEditContext } from "../../../tree/hooks/useLeafEdit";
import { ClassSelect } from "../../inspector/components/ClassSelect";
import { DefaultProperty } from "../../inspector/components/DefaultProperty";
import { type HeldClass, usePrimitivePick } from "../../inspector/components/PrimitivePicker";
import { shapeDefault } from "../../inspector/components/ShapeProperty";
import { ROTATION, ShapeRotations } from "../../inspector/components/ShapeRotations";
import { SHAPE_CLASSES, SHAPE_FIELD, SHAPE_LAYOUT } from "../../inspector/utils/emissionSource";
import { emitterLabel } from "../../inspector/utils/emitterLabels";
import type { StructItem } from "../utils/graphItems";
import { holderRow } from "../utils/holderRow";
import { ClassAction } from "./ClassAction";
import {
  FieldLine,
  Line,
  NAME_COLUMN,
  NoteLine,
  RowMarks,
  SectionLine,
  useRowsAt,
} from "./FieldLines";
import { GraphActionsContext, NO_DOCUMENT } from "./graphActions";

/** Draws one inspector row as a line of the node. */
function line(row: ReactNode): ReactNode {
  return (
    <Line>
      <div className="min-w-0 flex-1 overflow-hidden">{row}</div>
    </Line>
  );
}

/**
 * A Geometry node's spawn shape section: its heading with the shape class menu, then the rows
 * the inspector draws for the class, one line each.
 *
 * "The spawn shape" in docs/ux/BIN_EDITOR.md. The fields come from `SHAPE_LAYOUT`, so the node
 * draws the `shapeSectionLines` that its layout counts. A field the file leaves out draws at its
 * default, and the rotation lists draw as one list.
 */
export function ShapeSection({ item, holder }: { item: StructItem; holder: BinRow }) {
  const actions = use(GraphActionsContext);
  const editProperty = use(LeafEditContext)?.editProperty;
  const rows = useRowsAt(item.wire, item.rows.length);
  const shown = useMemo(() => (rows === null ? [] : [...rows.values()]), [rows]);
  const classHash = item.classHash ?? "";
  const { data: schema } = useClassSchema(classHash === "" ? null : classHash);
  const shape = useMemo(
    () => holderRow(actions?.entry ?? "", item.wire),
    [actions?.entry, item.wire],
  );
  const onEdit =
    editProperty === undefined
      ? null
      : (edits: ValueEdit[]) => void editProperty(holder, SHAPE_FIELD, edits);
  const rowAt = (hash: string) => rows?.get(`${item.wire}.${hash.slice(2)}`);
  const title = m.workshop_bin_vfx_property_spawn_shape_label();

  return (
    <>
      <SectionLine title={title} action={<ClassAction item={item} />} />
      <RowMarks rows={shown} read="curves">
        {(SHAPE_LAYOUT.get(classHash) ?? []).map((hash) => {
          const declared = schema?.fields.find((each) => each.hash === hash);
          const name = declared?.name ?? hash;
          const row = rowAt(hash);

          if (hash === ROTATION.angles) {
            return (
              <ShapeRotations
                key={hash}
                document={actions?.document ?? NO_DOCUMENT}
                holder={shape}
                field={{ hash, name, declared: declared?.declared ?? null }}
                anglesRow={row}
                axesRow={rowAt(ROTATION.axes)}
                width={NAME_COLUMN}
                depth={0}
                owner={classHash}
                onEdit={onEdit}
                line={line}
              />
            );
          }
          if (row !== undefined) {
            return (
              <FieldLine key={hash} row={row} label={emitterLabel(hash, name)} owner={classHash} />
            );
          }
          if (declared === undefined) {
            return <NoteLine key={hash} label={emitterLabel(hash, name) ?? name} />;
          }

          return (
            <Line key={hash}>
              <div className="min-w-0 flex-1 overflow-hidden">
                <DefaultProperty
                  field={shapeDefault(declared)}
                  holder={shape}
                  width={NAME_COLUMN}
                  owner={classHash}
                />
              </div>
            </Line>
          );
        })}
      </RowMarks>
    </>
  );
}

/** A spawn shape the emitter does not write yet, picked from the inspector's shape select. */
export function ShapeLine({ label, holder }: { label: string; holder: BinRow }) {
  const held: HeldClass | null = null;
  const pick = usePrimitivePick(holder, SHAPE_FIELD, held);

  return (
    <Line>
      <span className={twMerge(NAME_COLUMN, "ml-5.5 shrink-0 truncate text-surface-400")}>
        {label}
      </span>
      <div className="min-w-0 flex-1 border-l border-surface-700/40 pl-1">
        <InputDefaultContext value>
          <ClassSelect
            held={held}
            classes={SHAPE_CLASSES}
            label={label}
            unsetDescription={m.workshop_bin_vfx_shape_unset_description()}
            onPick={pick}
          />
        </InputDefaultContext>
      </div>
    </Line>
  );
}
