import { use } from "react";

import { InputDefaultContext } from "@/components";
import { m } from "@/i18n";
import type { BinRow } from "@/lib/tauri";
import { twMerge } from "@/utils";

import { FieldRow } from "../../../classes/components/ClassCells";
import { RowDocumentContext } from "../../../tree/state/rowFold";
import type { EmitterModel } from "../../engine/model/model";
import { VfxRunContext } from "../../playback/state/run";
import { useEmitters } from "../state/emitterChoice";
import type { DefaultField } from "../utils/emitterGroups";
import { emitterLabel } from "../utils/emitterLabels";
import {
  type HeldClass,
  heldPrimitive,
  PrimitivePicker,
  usePrimitivePick,
} from "./PrimitivePicker";
import { PrimitivePreview } from "./PrimitivePreview";
import { absentRow, StructFields } from "./StructFields";

/**
 * The emitter's primitive, as a picker over the primitive classes and the fields of the held one.
 *
 * "The primitive" in docs/ux/BIN_EDITOR.md. Every field the class declares draws under it, and a
 * field the file leaves out draws dimmed at its default and writes through on its first edit.
 */
export function PrimitiveProperty({
  field,
  holder,
  authored,
  width,
  owner,
}: {
  field: DefaultField;
  /** The emitter the primitive is a field of. */
  holder: BinRow;
  /** The primitive the file holds, and undefined for an emitter that leaves it out. */
  authored?: BinRow;
  width: string;
  owner: string | null;
}) {
  const document = use(RowDocumentContext);
  const emitter = useEmitterModel();
  const held: HeldClass | null = authored?.value.type === "struct" ? authored.value : null;
  const { known, text } = heldPrimitive(held);
  const pick = usePrimitivePick(holder, field.hash, held);
  const implicit = authored === undefined;
  const label = emitterLabel(field.hash, field.name);
  const row = authored ?? absentRow(holder, field, { type: "null" });

  return (
    <>
      <div title={implicit ? m.workshop_bin_force_default_label() : undefined}>
        <InputDefaultContext value={implicit}>
          <RowDocumentContext value={null}>
            <FieldRow
              row={row}
              label={label}
              tableLayout
              width={width}
              owner={owner}
              valueSlot={
                <PrimitivePicker
                  held={held}
                  known={known}
                  text={text}
                  label={label}
                  onPick={pick}
                />
              }
            />
          </RowDocumentContext>
        </InputDefaultContext>
      </div>
      <div data-ui="PrimitiveProperty:sketch" className="flex px-1.5">
        <span aria-hidden className={twMerge("shrink-0", width)} />
        <div className="border-l border-surface-700/40 py-1 pl-2">
          <PrimitivePreview
            kind={known?.sketch ?? "none"}
            name={text}
            mesh={emitter?.mesh ?? null}
          />
        </div>
      </div>
      {document !== null && authored !== undefined && held !== null && (
        <StructFields
          document={document}
          row={authored}
          classHash={held.classHash}
          width={width}
          depth={1}
        />
      )}
    </>
  );
}

/** The run's model of the emitter the inspector draws, where a run holds one. */
function useEmitterModel(): EmitterModel | undefined {
  const { card, child } = useEmitters();
  const run = use(VfxRunContext);
  if (child !== null) {
    return child.emitter;
  }

  return run?.system?.emitters.find(
    (emitter) => emitter.simple === card?.simple && emitter.listIndex === card?.index,
  );
}
