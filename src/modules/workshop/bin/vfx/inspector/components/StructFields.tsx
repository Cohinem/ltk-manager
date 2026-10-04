import { Fragment, type ReactNode, use, useMemo } from "react";

import { InputDefaultContext, Stack } from "@/components";
import { m } from "@/i18n";
import type { BinDocumentId, BinRow, FieldSchema } from "@/lib/tauri";

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
import { type DefaultField, defaultField } from "../utils/emitterGroups";
import { DefaultProperty } from "./DefaultProperty";

const NO_ROWS: readonly BinRow[] = [];

/** One field of a struct as a host is offered it, to draw in place of the field's own row. */
export interface FieldSlot {
  readonly field: FieldSchema;
  /** The row the file holds for the field, and undefined for a field it leaves out. */
  readonly child: BinRow | undefined;
  /** The struct the file holds that the field is under, through `within` where it is set. */
  readonly holder: BinRow;
  /** The embed of `holder` the field sits in, which the file leaves out. */
  readonly within: DefaultField | undefined;
  /** The class the field is read on. */
  readonly owner: string;
  readonly width: string;
  readonly depth: number;
}

/**
 * What a host draws for a field: undefined for the field's own row, and null for nothing.
 */
export type SpecialField = (slot: FieldSlot) => ReactNode | undefined;

/** The fields of the class `classHash` a host draws, in the order it draws them. */
export type ArrangeFields = (
  classHash: string,
  fields: readonly FieldSchema[],
) => readonly FieldSchema[];

/** The class an embed field holds, and null for any other field and for a value family. */
function embedClass(field: FieldSchema): string | null {
  if (field.declared?.kind !== "embed" || field.classHash === null) {
    return null;
  }

  return classFamily(field.classHash) === null ? field.classHash : null;
}

/** Every field the class declares, its embeds last. */
function embedsLast(fields: readonly FieldSchema[]): readonly FieldSchema[] {
  return [
    ...fields.filter((field) => embedClass(field) === null),
    ...fields.filter((field) => embedClass(field) !== null),
  ];
}

export interface StructFieldsProps {
  document: BinDocumentId;
  /** The struct the file holds. */
  row: BinRow;
  classHash: string;
  width: string;
  depth: number;
  /** The fields drawn of each class under the struct. Every field, embeds last, where absent. */
  arrange?: ArrangeFields;
  /** The fields a host draws itself, at any depth under the struct. */
  special?: SpecialField;
}

/**
 * Every field a struct's class declares, the held ones as the file holds them and the rest at
 * their defaults. An embed draws its own fields under its name.
 *
 * "The primitive" in docs/ux/BIN_EDITOR.md. A row the file holds that the arrangement leaves
 * out draws after the rest, so nothing the file holds goes undrawn.
 */
export function StructFields({
  document,
  row,
  classHash,
  width,
  depth,
  arrange,
  special,
}: StructFieldsProps) {
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
  const ordered = arrange?.(classHash, declared) ?? embedsLast(declared);
  const undrawn = children.filter(
    (child) => !ordered.some((field) => field.hash === fieldHash(child.path)),
  );

  return (
    <ValueMarksContext value={marks}>
      <AlsoCheck document={document} group={group}>
        <Stack gap={0.5} data-ui="StructFields">
          {ordered.map((field) => {
            const child = byField.get(field.hash);
            const drawn = special?.({
              field,
              child,
              holder: row,
              within: undefined,
              owner: classHash,
              width,
              depth,
            });
            if (drawn !== undefined) {
              return <Fragment key={field.hash}>{drawn}</Fragment>;
            }

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
                  arrange={arrange}
                  special={special}
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
                  arrange={arrange}
                  special={special}
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
          {undrawn.map((child) => (
            <FieldRow
              key={rowKey(child)}
              row={child}
              tableLayout
              width={width}
              depth={depth}
              owner={classHash}
            />
          ))}
        </Stack>
      </AlsoCheck>
    </ValueMarksContext>
  );
}

interface EmbedFieldsProps extends StructFieldsProps {
  /** The class the embed is a field of. */
  owner: string;
}

/** An embed the file holds: its name and class, and its fields under it. */
function EmbedFields({
  document,
  row,
  classHash,
  owner,
  width,
  depth,
  arrange,
  special,
}: EmbedFieldsProps) {
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
        arrange={arrange}
        special={special}
      />
    </>
  );
}

/** The row a field of `holder` the file leaves out draws as, holding `value`. */
export function absentRow(holder: BinRow, field: DefaultField, value: BinRow["value"]): BinRow {
  return {
    entry: holder.entry,
    path: [holder.path, field.hash.slice(2)].filter(Boolean).join("."),
    label: `${holder.label}.${field.name}`,
    node: "property",
    name: field.name,
    unnamed: field.name === field.hash,
    kind: field.declared?.kind ?? null,
    declared: field.declared === null ? null : { shape: field.declared, mismatch: false },
    value,
  };
}

interface AbsentEmbedProps {
  holder: BinRow;
  field: DefaultField;
  classHash: string;
  owner: string;
  width: string;
  depth: number;
  arrange?: ArrangeFields;
  special?: SpecialField;
}

/** An embed the file leaves out: its name and class dimmed, and its fields at their defaults. */
function AbsentEmbed({
  holder,
  field,
  classHash,
  owner,
  width,
  depth,
  arrange,
  special,
}: AbsentEmbedProps) {
  const { data: schema } = useClassSchema(classHash);
  const name = schema?.name ?? null;
  const row = absentRow(holder, field, { type: "struct", classHash, class: name, len: 0 });
  const declared = schema?.fields ?? [];
  const ordered = arrange?.(classHash, declared) ?? declared;

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
      {ordered.map((inner) => {
        const drawn = special?.({
          field: inner,
          child: undefined,
          holder,
          within: field,
          owner: classHash,
          width,
          depth: depth + 1,
        });
        if (drawn !== undefined) {
          return <Fragment key={inner.hash}>{drawn}</Fragment>;
        }

        return (
          <DefaultProperty
            key={inner.hash}
            field={defaultField(inner)}
            holder={holder}
            within={field}
            width={width}
            owner={classHash}
            depth={depth + 1}
          />
        );
      })}
    </>
  );
}
