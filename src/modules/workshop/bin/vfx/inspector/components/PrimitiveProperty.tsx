import { use, useMemo } from "react";

import { InputDefaultContext } from "@/components";
import { m } from "@/i18n";
import type { BinDocumentId, BinRow, FieldSchema } from "@/lib/tauri";
import { twMerge } from "@/utils";

import { ClassCard } from "../../../classes/components/ClassCard";
import { AlsoCheck, FieldRow } from "../../../classes/components/ClassCells";
import { useClassSchema } from "../../../classes/hooks/useClassSchema";
import { useBinRead } from "../../../documents/hooks/useBinRead";
import type { RowGroup } from "../../../links/hooks/useLinkTargets";
import { RowDocumentContext } from "../../../tree/state/rowFold";
import { useHeldRows } from "../../../tree/state/rowRegistry";
import { childCount, fieldHash, rowKey } from "../../../tree/utils/binRows";
import { useValueMarks, ValueMarksContext } from "../../../values/hooks/useValueMarks";
import { classFamily, valueFamily } from "../../../values/utils/valueRows";
import type { EmitterModel } from "../../engine/model/model";
import { VfxRunContext } from "../../playback/state/run";
import { useEmitters } from "../state/emitterChoice";
import { type DefaultField, defaultField } from "../utils/emitterGroups";
import { emitterLabel } from "../utils/emitterLabels";
import { DefaultProperty } from "./DefaultProperty";
import {
  type HeldClass,
  heldPrimitive,
  PrimitivePicker,
  usePrimitivePick,
} from "./PrimitivePicker";
import { PrimitivePreview } from "./PrimitivePreview";

const NO_ROWS: readonly BinRow[] = [];

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
  const row: BinRow = authored ?? {
    entry: holder.entry,
    path: [holder.path, field.hash.slice(2)].filter(Boolean).join("."),
    label: `${holder.label}.${field.name}`,
    node: "property",
    name: field.name,
    unnamed: field.name === field.hash,
    kind: field.declared?.kind ?? null,
    declared: field.declared === null ? null : { shape: field.declared, mismatch: false },
    value: { type: "null" },
  };

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

/** The class an embed field holds, and null for any other field and for a value family. */
function embedClass(field: FieldSchema): string | null {
  if (field.declared?.kind !== "embed" || field.classHash === null) {
    return null;
  }

  return classFamily(field.classHash) === null ? field.classHash : null;
}

interface StructFieldsProps {
  document: BinDocumentId;
  /** The struct the file holds. */
  row: BinRow;
  classHash: string;
  width: string;
  depth: number;
}

/**
 * Every field a struct's class declares, the held ones as the file holds them and the rest at
 * their defaults. An embed draws its own fields under its name, and embeds come last.
 */
function StructFields({ document, row, classHash, width, depth }: StructFieldsProps) {
  const { data: schema } = useClassSchema(classHash);
  const key = rowKey(row);
  const requests = useMemo(() => [{ key, rows: childCount(row) }], [key, row]);
  const children = useBinRead(document, requests).get(key)?.rows ?? NO_ROWS;
  const families = useMemo(
    () => children.filter((child) => valueFamily(child.value) !== null),
    [children],
  );
  const own = useValueMarks(document, families, "curves");
  const outer = use(ValueMarksContext);
  const marks = useMemo(() => new Map([...outer, ...own]), [outer, own]);
  const group = useMemo<RowGroup>(() => ({ key, rows: children }), [key, children]);
  useHeldRows(children);

  const declared = schema?.fields ?? [];
  const byField = new Map(children.map((child) => [fieldHash(child.path), child]));
  const ordered = [
    ...declared.filter((field) => embedClass(field) === null),
    ...declared.filter((field) => embedClass(field) !== null),
  ];
  const undeclared = children.filter(
    (child) => !declared.some((field) => field.hash === fieldHash(child.path)),
  );

  return (
    <ValueMarksContext value={marks}>
      <AlsoCheck document={document} group={group}>
        <div data-ui="PrimitiveProperty:fields" className="flex flex-col gap-0.5">
          {ordered.map((field) => {
            const child = byField.get(field.hash);
            const embed = embedClass(field);
            if (embed !== null && child?.value.type === "struct") {
              return (
                <EmbedFields
                  key={field.hash}
                  document={document}
                  row={child}
                  classHash={child.value.classHash}
                  owner={classHash}
                  width={width}
                  depth={depth}
                />
              );
            }

            if (embed !== null && child === undefined) {
              return (
                <AbsentEmbed
                  key={field.hash}
                  holder={row}
                  field={defaultField(field)}
                  classHash={embed}
                  owner={classHash}
                  width={width}
                  depth={depth}
                />
              );
            }

            if (child !== undefined) {
              return (
                <FieldRow
                  key={field.hash}
                  row={child}
                  tableLayout
                  width={width}
                  depth={depth}
                  owner={classHash}
                />
              );
            }

            return (
              <DefaultProperty
                key={field.hash}
                field={defaultField(field)}
                holder={row}
                width={width}
                owner={classHash}
                depth={depth}
              />
            );
          })}
          {undeclared.map((child) => (
            <FieldRow
              key={rowKey(child)}
              row={child}
              tableLayout
              width={width}
              depth={depth}
              owner={classHash}
            />
          ))}
        </div>
      </AlsoCheck>
    </ValueMarksContext>
  );
}

interface EmbedFieldsProps extends StructFieldsProps {
  /** The class the embed is a field of. */
  owner: string;
}

/** An embed the file holds: its name and class, and its fields under it. */
function EmbedFields({ document, row, classHash, owner, width, depth }: EmbedFieldsProps) {
  const name = row.value.type === "struct" ? row.value.class : null;

  return (
    <>
      <RowDocumentContext value={null}>
        <FieldRow
          row={row}
          tableLayout
          width={width}
          depth={depth}
          owner={owner}
          valueSlot={<ClassCard classHash={classHash} name={name} />}
        />
      </RowDocumentContext>
      <StructFields
        document={document}
        row={row}
        classHash={classHash}
        width={width}
        depth={depth + 1}
      />
    </>
  );
}

interface AbsentEmbedProps {
  holder: BinRow;
  field: DefaultField;
  classHash: string;
  owner: string;
  width: string;
  depth: number;
}

/** An embed the file leaves out: its name and class dimmed, and its fields at their defaults. */
function AbsentEmbed({ holder, field, classHash, owner, width, depth }: AbsentEmbedProps) {
  const { data: schema } = useClassSchema(classHash);
  const name = schema?.name ?? null;
  const row: BinRow = {
    entry: holder.entry,
    path: [holder.path, field.hash.slice(2)].filter(Boolean).join("."),
    label: `${holder.label}.${field.name}`,
    node: "property",
    name: field.name,
    unnamed: field.name === field.hash,
    kind: "embed",
    declared: field.declared === null ? null : { shape: field.declared, mismatch: false },
    value: { type: "struct", classHash, class: name, len: 0 },
  };

  return (
    <>
      <div title={m.workshop_bin_force_default_label()}>
        <InputDefaultContext value>
          <RowDocumentContext value={null}>
            <FieldRow
              row={row}
              tableLayout
              width={width}
              depth={depth}
              owner={owner}
              valueSlot={<ClassCard classHash={classHash} name={name} />}
            />
          </RowDocumentContext>
        </InputDefaultContext>
      </div>
      {(schema?.fields ?? []).map((inner) => (
        <DefaultProperty
          key={inner.hash}
          field={defaultField(inner)}
          holder={holder}
          within={field}
          width={width}
          owner={classHash}
          depth={depth + 1}
        />
      ))}
    </>
  );
}
