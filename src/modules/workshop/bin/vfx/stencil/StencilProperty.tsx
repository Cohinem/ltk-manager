import { CaretDownIcon } from "@phosphor-icons/react";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";

import { InputDefaultContext, Select } from "@/components";
import { m } from "@/i18n";
import type { BinRow } from "@/lib/tauri";
import { twMerge } from "@/utils";

import { FieldRow } from "../../classes/components/ClassCells";
import { RowDocumentContext } from "../../tree/state/rowFold";
import { STENCIL_MODE, type StencilMode } from "../engine/model/enums";
import { field as fieldOf, nameId } from "../engine/parsing/readValue";
import { absentRow } from "../inspector/components/StructFields";
import type { DefaultField } from "../inspector/utils/emitterGroups";
import { emitterLabel } from "../inspector/utils/emitterLabels";
import { STENCIL_BITS } from "../rendering/utils/stencil";
import { freeReference, maskKey, type MaskName } from "./maskModel";
import { maskLabel, writersLine } from "./maskText";
import { maskEdits, modeEdits, STENCIL_FIELD } from "./stencilEdits";
import { useStencilEdit, useStencilMasks } from "./useStencil";

interface StencilRowProps {
  field: DefaultField;
  /** The row of the emitter the field belongs to. */
  emitterRow: BinRow;
  /** The row the file has for the field, and undefined for an emitter that leaves it out. */
  authored?: BinRow;
  width: string;
  owner: string | null;
}

/** What each mode reads as and does, in enum order. */
const MODES: readonly {
  readonly mode: StencilMode;
  readonly label: () => string;
  readonly description: () => string;
}[] = [
  {
    mode: STENCIL_MODE.disabled,
    label: m.workshop_bin_stencil_mode_off_label,
    description: m.workshop_bin_stencil_mode_off_description,
  },
  {
    mode: STENCIL_MODE.writeMask,
    label: m.workshop_bin_stencil_mode_writes_label,
    description: m.workshop_bin_stencil_mode_writes_description,
  },
  {
    mode: STENCIL_MODE.testEqual,
    label: m.workshop_bin_stencil_mode_inside_label,
    description: m.workshop_bin_stencil_mode_inside_description,
  },
  {
    mode: STENCIL_MODE.testNotEqual,
    label: m.workshop_bin_stencil_mode_outside_label,
    description: m.workshop_bin_stencil_mode_outside_description,
  },
  {
    mode: STENCIL_MODE.writeMaskIfTestNotEqual,
    label: m.workshop_bin_stencil_mode_writes_outside_label,
    description: m.workshop_bin_stencil_mode_writes_outside_description,
  },
];

/** The integer an authored row has, and null for an absent row or another kind. */
function integerOf(row: BinRow | undefined): number | null {
  return row?.value.type === "integer" ? Number(row.value.text) : null;
}

/** The trigger every stencil picker draws. DS-VEIL, DS-RADIUS. */
const TRIGGER =
  "h-auto w-auto min-w-0 shrink-0 gap-1 rounded-sm border-surface-veil bg-surface-veil-soft px-1.5 py-0.5 font-sans text-meta whitespace-nowrap text-surface-200";

/** The trigger of a field the file leaves out, dashed as every default is. */
const TRIGGER_DEFAULT = "border-dashed bg-transparent text-surface-400";

/** A stencil field's row, drawn with `slot` in place of its value. */
function StencilRow({
  field,
  emitterRow,
  authored,
  width,
  owner,
  slot,
}: StencilRowProps & { slot: ReactNode }) {
  const implicit = authored === undefined;
  const row = authored ?? absentRow(emitterRow, field, { type: "integer", text: "0" });

  return (
    <InputDefaultContext value={implicit}>
      <RowDocumentContext value={null}>
        <FieldRow
          row={row}
          label={emitterLabel(field.hash, field.name)}
          tableLayout
          width={width}
          owner={owner}
          valueSlot={slot}
        />
      </RowDocumentContext>
    </InputDefaultContext>
  );
}

/**
 * `stencilMode` as a choice of what the emitter does with its mask.
 *
 * "The stencil" in docs/ux/BIN_EDITOR.md.
 */
export function StencilModeProperty(props: StencilRowProps) {
  const edit = useStencilEdit();
  const mode = integerOf(props.authored) ?? STENCIL_MODE.disabled;
  const known = MODES.find((each) => each.mode === mode);
  const text = known?.label() ?? String(mode);
  const implicit = props.authored === undefined;
  const number = <span className="font-mono text-meta text-surface-500">{mode}</span>;

  if (edit === null) {
    return (
      <StencilRow
        {...props}
        slot={
          <span className="flex min-w-0 items-center gap-2">
            <span className={twMerge("text-surface-200", implicit && "text-surface-400")}>
              {text}
            </span>
            {number}
          </span>
        }
      />
    );
  }

  return (
    <StencilRow
      {...props}
      slot={
        <span className="flex min-w-0 items-center gap-2">
          <Select.Root
            value={String(mode)}
            onValueChange={(next) => {
              if (next === null || Number(next) === mode) return;
              void edit.apply(modeEdits(edit.index, Number(next) as StencilMode));
            }}
          >
            <Select.Trigger
              aria-label={emitterLabel(props.field.hash, props.field.name)}
              className={twMerge(TRIGGER, implicit && TRIGGER_DEFAULT)}
              onClick={(event: ReactMouseEvent<HTMLButtonElement>) => event.stopPropagation()}
            >
              <Select.Value>{() => text}</Select.Value>
              <CaretDownIcon weight="bold" className="size-3 shrink-0 text-surface-400" />
            </Select.Trigger>
            <Select.Content className="min-w-72">
              {known === undefined && (
                <Select.Item value={String(mode)} label={text}>
                  {text}
                </Select.Item>
              )}
              {MODES.map((each) => (
                <Select.Item
                  key={each.mode}
                  value={String(each.mode)}
                  label={each.label()}
                  description={each.description()}
                >
                  {each.label()}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
          {number}
        </span>
      }
    />
  );
}

/** The picker's value for a mask on the lowest free reference. */
const NEW_MASK = "new";

/**
 * `stencilRef` as a choice among the masks of the system, each with the emitters that write it.
 *
 * A pick of a numbered mask writes `stencilRef`. A pick of a mask named by a
 * `StencilReferenceId` writes that id. "The stencil" in docs/ux/BIN_EDITOR.md.
 */
export function StencilMaskProperty(props: StencilRowProps) {
  const edit = useStencilEdit();
  const masks = useStencilMasks();
  const implicit = props.authored === undefined;
  const id = nameId(fieldOf(edit?.node ?? null, STENCIL_FIELD.id));
  const current: MaskName = {
    id,
    ref: id === null ? (integerOf(props.authored) ?? 0) & STENCIL_BITS : 0,
  };
  const currentKey = maskKey(current);
  const listed = masks.find((mask) => mask.key === currentKey);
  const free = freeReference(masks);

  if (edit === null) {
    return (
      <StencilRow
        {...props}
        slot={
          <span className={twMerge("text-surface-200", implicit && "text-surface-400")}>
            {maskLabel(current)}
          </span>
        }
      />
    );
  }

  const pick = (next: string | null) => {
    if (next === null || next === currentKey) return;

    const created: MaskName | undefined = free === null ? undefined : { id: null, ref: free };
    const mask = next === NEW_MASK ? created : masks.find((each) => each.key === next);
    if (mask !== undefined) void edit.apply(maskEdits(edit.index, mask, edit.node));
  };

  return (
    <StencilRow
      {...props}
      slot={
        <span className="flex min-w-0 items-center gap-2">
          <Select.Root value={currentKey} onValueChange={pick}>
            <Select.Trigger
              aria-label={m.workshop_bin_stencil_mask_picker_label()}
              className={twMerge(TRIGGER, implicit && TRIGGER_DEFAULT)}
              onClick={(event: ReactMouseEvent<HTMLButtonElement>) => event.stopPropagation()}
            >
              <Select.Value>{() => maskLabel(current)}</Select.Value>
              <CaretDownIcon weight="bold" className="size-3 shrink-0 text-surface-400" />
            </Select.Trigger>
            <Select.Content className="max-h-96 min-w-72">
              {listed === undefined && (
                <Select.Item value={currentKey} label={maskLabel(current)}>
                  {maskLabel(current)}
                </Select.Item>
              )}
              {masks.map((mask) => (
                <Select.Item
                  key={mask.key}
                  value={mask.key}
                  label={maskLabel(mask)}
                  description={writersLine(mask)}
                >
                  {maskLabel(mask)}
                </Select.Item>
              ))}
              {free !== null && (
                <Select.Item
                  value={NEW_MASK}
                  label={m.workshop_bin_stencil_mask_new_label({ mask: String(free) })}
                  description={m.workshop_bin_stencil_mask_new_description()}
                >
                  {m.workshop_bin_stencil_mask_new_label({ mask: String(free) })}
                </Select.Item>
              )}
            </Select.Content>
          </Select.Root>
          {listed !== undefined && (
            <span className="min-w-0 truncate font-sans text-meta text-surface-400">
              {writersLine(listed)}
            </span>
          )}
        </span>
      }
    />
  );
}
