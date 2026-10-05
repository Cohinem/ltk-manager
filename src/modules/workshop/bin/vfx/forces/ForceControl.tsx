import { ArrowsOutCardinalIcon } from "@phosphor-icons/react";
import { use, useRef, useState } from "react";

import { IconButton, InputDefaultContext, Readout, Switch, Table, Tooltip } from "@/components";
import { m } from "@/i18n";
import type { BinRow, BinValue } from "@/lib/tauri";
import { twMerge } from "@/utils";

import { CurveToggle } from "../../classes/components/ClassCells";
import { FieldCard, schemaDeclared } from "../../classes/components/FieldCard";
import { useClassSchema } from "../../classes/hooks/useClassSchema";
import { Sparkline } from "../../curves/components/Sparkline";
import { CurveDockContext } from "../../curves/state/curveTarget";
import { CURVE_DYNAMICS, curveActivationEdits } from "../../curves/utils/curveEdits";
import { DeclaredRowState } from "../../documents/components/DeclaredLayer";
import { nameHash } from "../../shared/utils/binHash";
import { LeafEditContext } from "../../tree/hooks/useLeafEdit";
import type { CurveKey } from "../../values/utils/valueRows";
import { curve as readCurve, field } from "../engine/parsing/readValue";
import { commitForceValue } from "./forceEdits";
import {
  type AuthoredForce,
  FORCE_DEFAULT_BUILD,
  type ForceProperty,
  type ForceValue,
  forceValue,
  schemaForceDefault,
} from "./forceModel";
import { useForcePreview } from "./forcePreview";

const AXES = ["X", "Y", "Z"];

/** A force property in aligned label and value cells, with its animation below. */
export function ForceControl({
  force,
  property,
  hosted,
  disabled,
}: {
  force: AuthoredForce;
  property: ForceProperty;
  hosted: boolean;
  disabled: boolean;
}) {
  const edit = use(LeafEditContext);
  const preview = useForcePreview();
  const classHash = nameHash(force.definition.className);
  const { data: schema } = useClassSchema(classHash);
  const read = forceValue(force, property);
  const schemaDefault = schemaForceDefault(
    property,
    schema?.fields.find((each) => each.hash === nameHash(property.name))?.defaultValue,
  );
  /* An unauthored property shows the schema's default, and the pinned build's only where the
     schema has none. */
  const held = read.authored || schemaDefault === null ? read : { ...read, value: schemaDefault };
  const refusal = edit?.refused.get(`${force.row.entry}:${held.leaf?.path ?? force.row.path}`);
  const known = held.authored || schemaDefault !== null || schema?.build === FORCE_DEFAULT_BUILD;
  const [invalid, setInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const editable =
    edit !== null &&
    held.valid &&
    known &&
    !disabled &&
    !busy &&
    (held.leaf !== null || edit.editProperty !== undefined);
  const curve =
    property.animated &&
    field(field(force.node, nameHash(property.name)), nameHash("dynamics"))?.type === "struct";
  const keys = readCurve(field(force.node, nameHash(property.name)), {
    constant: [],
    keys: [],
    tables: [],
  }).keys;
  const handle =
    property.name === "Position" ||
    property.name === "radius" ||
    (property.shape === "vector" && property.name !== "axisFraction");

  async function commit(value: ForceValue) {
    if (!editable || edit === null || saving.current) {
      return;
    }

    saving.current = true;
    setBusy(true);

    try {
      setInvalid(!(await commitForceValue(edit, force, property, value)));
    } catch {
      setInvalid(true);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  function number(text: string, index: number) {
    const value = Number(text);
    if (text.trim() === "" || !Number.isFinite(value) || typeof held.value === "boolean") {
      setInvalid(true);
      return;
    }

    const next = [...held.value];
    next[index] = value;
    void commit(next);
  }

  return (
    <InputDefaultContext value={!held.authored}>
      <Table.Row data-ui="ForcesSection:property" className="hover:bg-surface-veil-soft">
        <Table.Head
          scope="row"
          className={twMerge(
            "border-r border-b-0 border-surface-700/40 bg-transparent py-0 pr-2 pl-5 align-top text-row font-normal text-surface-200",
            !held.authored && "text-surface-400",
          )}
        >
          <FieldCard
            classHash={classHash}
            fieldHash={nameHash(property.name)}
            name={property.name}
            label={property.label()}
            unnamed={false}
            declared={schemaDeclared(schema, nameHash(property.name))}
            defaultValue={held.authored || !known ? null : JSON.stringify(held.value)}
            triggerClassName="block leading-6"
          />
        </Table.Head>
        <Table.Cell className="border-b-0 px-2 py-0">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex min-h-6 min-w-0 items-center gap-1">
              <div className="min-w-0 flex-1">
                {!known && (
                  <span className="text-meta text-surface-400">
                    {m.workshop_bin_force_default_unknown_hint()}
                  </span>
                )}
                {known && typeof held.value === "boolean" && (
                  <Switch
                    aria-label={property.label()}
                    checked={held.value}
                    disabled={!editable}
                    onCheckedChange={(value) => void commit(value)}
                  />
                )}
                {known && typeof held.value !== "boolean" && (
                  <div className="flex min-w-0 items-center gap-1">
                    {held.value.map((value, index) => (
                      <Readout
                        key={index}
                        value={String(value)}
                        label={property.shape === "vector" ? AXES[index] : undefined}
                        channel={property.shape === "vector" ? index : undefined}
                        aria-label={`${property.label()}${property.shape === "vector" ? ` ${AXES[index]}` : ""}`}
                        className={
                          property.shape === "vector"
                            ? "w-[var(--bin-component-width,6rem)]"
                            : "w-[var(--bin-scalar-width,8rem)]"
                        }
                        step={property.shape === "vector" ? 1 : 0.1}
                        invalid={invalid || !held.valid || refusal !== undefined}
                        onCommit={editable ? (text) => number(text, index) : undefined}
                      />
                    ))}
                  </div>
                )}
              </div>
              {property.animated && known && (
                <ForceCurve
                  force={force}
                  property={property}
                  held={held}
                  keys={keys}
                  curve={curve}
                  editable={editable}
                />
              )}
              <span className="flex w-5 shrink-0 items-center">
                {hosted && handle && editable && !curve && (
                  <IconButton
                    size="sm"
                    disabled={
                      preview.muted.has(force.key) ||
                      (preview.solo !== null && preview.solo !== force.key)
                    }
                    icon={<ArrowsOutCardinalIcon />}
                    aria-label={m.workshop_bin_force_handle_label({ property: property.label() })}
                    onClick={() => preview.select(force.key, property.name)}
                    tooltip={m.workshop_bin_force_handle_action()}
                  />
                )}
              </span>
            </div>
            {(invalid || refusal !== undefined) && (
              <p role="alert" className="text-meta text-danger-text">
                {m.workshop_bin_force_save_failed_hint()}
              </p>
            )}
            <DeclaredRowState
              rowKey={`${force.row.entry}:${held.leaf?.path ?? held.row?.path ?? force.row.path}`}
            />
          </div>
        </Table.Cell>
      </Table.Row>
    </InputDefaultContext>
  );
}

/**
 * An animated force property's curve controls: the curve's chip, which opens it in the curve
 * pane, and the Constant or Curve switch the inspector's value rows carry.
 */
function ForceCurve({
  force,
  property,
  held,
  keys,
  curve,
  editable,
}: {
  force: AuthoredForce;
  property: ForceProperty;
  held: ReturnType<typeof forceValue>;
  keys: readonly CurveKey[];
  curve: boolean;
  editable: boolean;
}) {
  const edit = use(LeafEditContext);
  const dock = use(CurveDockContext);
  const chain = force.definition.title();
  const valueClass = nameHash(property.shape === "scalar" ? "ValueFloat" : "ValueVector3");

  function open(row: BinRow) {
    dock?.aim({ row, chain, tab: "graph" });
  }

  async function toCurve() {
    if (curve && held.row !== null) return open(held.row);
    if (edit?.editProperty === undefined || typeof held.value === "boolean") return;

    const constant: BinValue =
      property.shape === "scalar"
        ? { type: "float", value: held.value[0] ?? 0 }
        : { type: "vector", values: [...held.value] };
    const scope = held.row === null ? "value" : "dynamics";
    const edits = curveActivationEdits(valueClass, constant, scope);
    if (edits === null) return;

    if (held.row === null) {
      await edit.editProperty(force.row, nameHash(property.name), edits);
      return;
    }
    if (await edit.editProperty(held.row, CURVE_DYNAMICS, edits)) {
      open({ ...held.row, value: { type: "struct", classHash: valueClass, class: null, len: 2 } });
    }
  }

  async function toConstant() {
    if (edit?.setPointer === undefined || held.row === null) return;
    await edit.setPointer(held.row, CURVE_DYNAMICS, null);
  }

  return (
    <>
      {curve && held.row !== null && (
        <Tooltip content={m.workshop_bin_force_animated_hint()}>
          <button
            type="button"
            aria-label={m.workshop_bin_force_curve_action()}
            /* DS-RADIUS, DS-VEIL */
            className="flex h-5 shrink-0 cursor-pointer items-center rounded-sm px-1 hover:bg-surface-veil"
            onClick={() => held.row !== null && open(held.row)}
          >
            <Sparkline keys={keys} label={property.label()} />
          </button>
        </Tooltip>
      )}
      {editable && (
        <CurveToggle
          active={curve}
          onCurve={() => void toCurve()}
          onConstant={curve ? () => void toConstant() : undefined}
        />
      )}
    </>
  );
}
