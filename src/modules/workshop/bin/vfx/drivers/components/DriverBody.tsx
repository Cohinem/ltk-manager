import { type ReactNode, use, useMemo } from "react";

import { m } from "@/i18n";
import type { BinDocumentId, BinRow, VfxValue } from "@/lib/tauri";
import { twMerge } from "@/utils";

import { useBinRead } from "../../../documents/hooks/useBinRead";
import { RowValue } from "../../../tree/components/BinRow";
import { Swatch } from "../../../values/components/ColorMark";
import type { DriverNode } from "../../engine/drivers/node";
import { driverClass } from "../../engine/drivers/registry";
import type { ValueCurve } from "../../engine/model/model";
import { LINE_HEIGHT, UNKNOWN_FIELD_LINES } from "../utils/driverLayout";
import type { LeafTarget } from "../utils/systemGraph";
import { type GraphActions, GraphActionsContext } from "./graphActions";

/**
 * What a driver node shows under its header: its value, an operator's stored values, or the
 * fields of an unread class.
 */
export function NodeBody({ node, leaves }: { node: DriverNode; leaves: readonly LeafTarget[] }) {
  const leaf = leaves[0] ?? null;

  switch (node.type) {
    case "constant":
      return (
        <LeafLine leaf={leaf}>
          <Values values={node.value} color={isColor(node.classHash)} />
        </LeafLine>
      );
    case "curve":
      return <CurveLine curve={node.curve} leaf={leaf} color={isColor(node.classHash)} />;
    case "operator":
      return node.stored.map((each, at) => (
        <span key={each.field} className="flex min-w-0 items-center gap-2">
          <span className="w-12 shrink-0 truncate font-mono text-code text-surface-400">
            {each.field}
          </span>
          <span className="min-w-0 flex-1">
            <LeafLine leaf={leaves[at] ?? null}>
              <Values values={each.value} color={false} />
            </LeafLine>
          </span>
        </span>
      ));
    case "empty":
      return <Line className="text-surface-400">{m.workshop_bin_driver_empty_label()}</Line>;
    case "unknown":
      return <UnknownFields value={node.value} />;
    case "property":
      return null;
  }
}

function Line({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span
      className={twMerge("flex min-w-0 items-center gap-1.5 text-meta", className)}
      style={{ height: LINE_HEIGHT }}
    >
      {children}
    </span>
  );
}

/**
 * The leaf's own field where the file writes the leaf, and `fallback` where it does not.
 *
 * The field is the inspector's, so a change is the same edit and the same undo step.
 */
function LeafLine({ leaf, children: fallback }: { leaf: LeafTarget | null; children: ReactNode }) {
  const actions = use(GraphActionsContext);
  const row = useLeafRow(actions, leaf);

  if (row === null) return <Line>{fallback}</Line>;
  return (
    <span className="nodrag nowheel flex min-w-0 items-center" style={{ height: LINE_HEIGHT }}>
      <RowValue row={row} />
    </span>
  );
}

/** The most rows a leaf's holder is read for. A constant holds one, and a value class two. */
const HOLDER_ROWS = 8;

function useLeafRow(actions: GraphActions | null, leaf: LeafTarget | null): BinRow | null {
  const key =
    actions === null || leaf === null || actions.entry === ""
      ? null
      : `${actions.entry}:${leaf.holder}`;
  const requests = useMemo(() => (key === null ? [] : [{ key, rows: HOLDER_ROWS }]), [key]);
  const pages = useBinRead(actions?.document ?? NO_DOCUMENT, requests);
  if (key === null || leaf === null) return null;

  const suffix = leaf.field.slice(2);
  return pages.get(key)?.rows.find((row) => row.path.endsWith(suffix)) ?? null;
}

/* Read with no request under it, so the id is never sent. */
const NO_DOCUMENT = 0 as BinDocumentId;

function isColor(classHash: string): boolean {
  return driverClass(classHash)?.color ?? false;
}

function Values({ values, color }: { values: readonly number[]; color: boolean }) {
  return (
    <>
      {color && <Swatch rgba={rgbaOf(values)} />}
      <span className="min-w-0 truncate font-mono text-code text-surface-100">
        {formatValues(values)}
      </span>
    </>
  );
}

/** A curve leaf's constant where it has no keys, and its key count where it has some. */
function CurveLine({
  curve,
  leaf,
  color,
}: {
  curve: ValueCurve;
  leaf: LeafTarget | null;
  color: boolean;
}) {
  if (curve.keys.length > 0) {
    return (
      <Line className="text-surface-300">
        {m.workshop_bin_driver_curve_keys_label({ count: curve.keys.length })}
      </Line>
    );
  }

  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="shrink-0 text-meta text-surface-400">
        {m.workshop_bin_driver_curve_flat_label()}
      </span>
      <span className="min-w-0 flex-1">
        <LeafLine leaf={leaf}>
          <Values values={curve.constant} color={color} />
        </LeafLine>
      </span>
    </span>
  );
}

/** A class the registry does not read, drawn as the fields it holds. */
function UnknownFields({ value }: { value: VfxValue }) {
  if (value.type !== "struct") {
    return <Line className="text-surface-400">{m.workshop_bin_driver_unknown_label()}</Line>;
  }

  const shown = value.fields.slice(0, UNKNOWN_FIELD_LINES);
  const rest = value.fields.length - shown.length;
  return (
    <>
      {shown.map((field) => (
        <Line key={field.hash} className="font-mono">
          <span className="min-w-0 flex-1 truncate text-code text-surface-300">
            {field.name ?? field.hash}
          </span>
          <span className="shrink-0 text-code text-surface-500">{field.value.type}</span>
        </Line>
      ))}
      {rest > 0 && (
        <Line className="text-surface-400">
          {m.workshop_bin_driver_fields_more_label({ count: rest })}
        </Line>
      )}
    </>
  );
}

function formatValues(values: readonly number[]): string {
  const text = values.map(formatNumber);
  return text.length === 1 ? text[0]! : `(${text.join(", ")})`;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/\.?0+$/, "");
}

/** A colour's four channels, an RGB colour taking a full alpha. */
function rgbaOf(values: readonly number[]): readonly [number, number, number, number] {
  return [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0, values[3] ?? 1];
}
