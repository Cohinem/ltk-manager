import { CaretDownIcon } from "@phosphor-icons/react";
import { type MouseEvent as ReactMouseEvent, use } from "react";

import { InputDefaultContext, Select } from "@/components";
import { m } from "@/i18n";
import type { BinRow } from "@/lib/tauri";
import { twMerge } from "@/utils";

import { ClassCard } from "../../../classes/components/ClassCard";
import { LeafEditContext } from "../../../tree/hooks/useLeafEdit";
import {
  DEFAULT_PRIMITIVE,
  type Primitive,
  PRIMITIVE_FAMILIES,
  PRIMITIVES,
  primitiveOf,
} from "../utils/primitives";

/** The picker's value for an emitter that names no primitive. */
const UNSET = "";

/** The class a primitive pointer holds. */
export interface HeldClass {
  /** `0x` and eight hex digits. */
  readonly classHash: string;
  readonly class: string | null;
}

/** A held primitive as the picker reads it: its entry, undefined where unlisted, and its text. */
export function heldPrimitive(held: HeldClass | null): {
  known: Primitive | undefined;
  text: string;
} {
  const known = held === null ? DEFAULT_PRIMITIVE : primitiveOf(held.classHash);
  return { known, text: known?.label() ?? held?.class ?? held?.classHash ?? "" };
}

/** The edit that swaps the primitive at `field` of `holder`, and null where edits are off. */
export function usePrimitivePick(
  holder: BinRow,
  field: string,
  held: HeldClass | null,
): ((classHash: string | null) => void) | null {
  const editProperty = use(LeafEditContext)?.editProperty;
  if (editProperty === undefined) {
    return null;
  }

  return (classHash) => {
    if (classHash === (held?.classHash ?? null)) {
      return;
    }

    void editProperty(holder, field, [{ type: "replacePointer", path: "", class: classHash }]);
  };
}

interface PrimitivePickerProps {
  held: HeldClass | null;
  /** The picker's reading of the held class, undefined for a class it does not list. */
  known: Primitive | undefined;
  /** What the trigger reads. */
  text: string;
  label: string | undefined;
  /** Null where the document takes no edit. */
  onPick: ((classHash: string | null) => void) | null;
}

/** A select of the primitive classes by family, and the held class's card beside it. */
export function PrimitivePicker({ held, known, text, label, onPick }: PrimitivePickerProps) {
  const implicit = use(InputDefaultContext);
  const card = held !== null && <ClassCard classHash={held.classHash} name={held.class} />;

  if (onPick === null) {
    return (
      <span className="flex min-w-0 items-center gap-2">
        <span className={twMerge("text-surface-200", implicit && "text-surface-400")}>{text}</span>
        {card}
      </span>
    );
  }

  return (
    <span className="flex min-w-0 items-center gap-2">
      <Select.Root
        value={held?.classHash ?? UNSET}
        onValueChange={(next) => next !== null && onPick(next === UNSET ? null : next)}
      >
        <Select.Trigger
          aria-label={label}
          /* DS-VEIL, DS-RADIUS */
          className={twMerge(
            "h-auto w-auto min-w-0 shrink-0 gap-1 rounded-sm border-surface-veil bg-surface-veil-soft px-1.5 py-0.5 font-sans text-meta whitespace-nowrap text-surface-200",
            implicit && "border-dashed bg-transparent text-surface-400",
          )}
          onClick={(event: ReactMouseEvent<HTMLButtonElement>) => event.stopPropagation()}
        >
          <Select.Value>{() => text}</Select.Value>
          <CaretDownIcon weight="bold" className="size-3 shrink-0 text-surface-400" />
        </Select.Trigger>
        <Select.Content className="max-h-96 min-w-64">
          <Select.Item
            value={UNSET}
            label={m.workshop_bin_vfx_primitive_unset_label()}
            description={m.workshop_bin_vfx_primitive_unset_description()}
          >
            {m.workshop_bin_vfx_primitive_unset_label()}
          </Select.Item>
          {held !== null && known === undefined && (
            <Select.Item value={held.classHash} label={text}>
              {text}
            </Select.Item>
          )}
          {PRIMITIVE_FAMILIES.map(({ family, label: heading }) => (
            <Select.Group key={family}>
              <Select.GroupLabel>{heading()}</Select.GroupLabel>
              {PRIMITIVES.filter((each) => each.family === family).map((each) => (
                <Select.Item
                  key={each.hash}
                  value={each.hash}
                  label={each.label()}
                  description={each.description()}
                >
                  {each.label()}
                </Select.Item>
              ))}
            </Select.Group>
          ))}
        </Select.Content>
      </Select.Root>
      {card}
    </span>
  );
}
