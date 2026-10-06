import { CaretDownIcon } from "@phosphor-icons/react";
import { type MouseEvent as ReactMouseEvent, use } from "react";

import { InputDefaultContext, Select } from "@/components";
import { m } from "@/i18n";
import { twMerge } from "@/utils";

import { ClassCard } from "../../../classes/components/ClassCard";
import type { SourceClass } from "../utils/emissionSource";
import type { HeldClass } from "./PrimitivePicker";

/** The select's value for a null pointer. */
const UNSET = "";

interface ClassSelectProps {
  held: HeldClass | null;
  /** The classes the pointer can hold, in list order. */
  classes: readonly SourceClass[];
  label: string | undefined;
  /** The description of the Not set option: what the engine does with a null pointer. */
  unsetDescription: string;
  /** Null when the document is read-only. */
  onPick: ((classHash: string | null) => void) | null;
}

/**
 * A select over the classes a pointer can hold, with the class card of the held class.
 *
 * A held class that is not in `classes` is listed under its own name, so the select always
 * shows the class in the file.
 */
export function ClassSelect({ held, classes, label, unsetDescription, onPick }: ClassSelectProps) {
  const implicit = use(InputDefaultContext);
  const known = held === null ? undefined : classes.find((each) => each.hash === held.classHash);
  const unset = m.workshop_bin_vfx_primitive_unset_label();
  const text = held === null ? unset : (known?.label() ?? held.class ?? held.classHash);
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
    <span data-ui="ClassSelect" className="flex min-w-0 items-center gap-2">
      <Select.Root
        value={held?.classHash ?? UNSET}
        onValueChange={(next) => {
          const picked = next === null || next === UNSET ? null : next;
          if (next !== null && picked !== (held?.classHash ?? null)) onPick(picked);
        }}
      >
        <Select.Trigger
          aria-label={label}
          /* DS-VEIL, DS-RADIUS */
          className={twMerge(
            "h-auto w-auto min-w-0 shrink-0 gap-1 rounded-sm border-surface-veil bg-surface-veil-soft px-1.5 py-0.5 font-sans text-meta whitespace-nowrap text-surface-200",
            (implicit || held === null) && "border-dashed bg-transparent text-surface-400",
          )}
          onClick={(event: ReactMouseEvent<HTMLButtonElement>) => event.stopPropagation()}
        >
          <Select.Value>{() => text}</Select.Value>
          <CaretDownIcon weight="bold" className="size-3 shrink-0 text-surface-400" />
        </Select.Trigger>
        <Select.Content className="max-h-96 min-w-64">
          <Select.Item value={UNSET} label={unset} description={unsetDescription}>
            {unset}
          </Select.Item>
          {held !== null && known === undefined && (
            <Select.Item value={held.classHash} label={text}>
              {text}
            </Select.Item>
          )}
          {classes.map((each) => (
            <Select.Item
              key={each.hash}
              value={each.hash}
              label={each.label()}
              description={each.description()}
            >
              {each.label()}
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Root>
      {card}
    </span>
  );
}
