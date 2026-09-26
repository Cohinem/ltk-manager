import { CaretDownIcon } from "@phosphor-icons/react";
import { type MouseEvent as ReactMouseEvent, use } from "react";

import { Code, InputDefaultContext, Menu } from "@/components";
import { m } from "@/i18n";
import { twMerge } from "@/utils";

import { enumText, type FieldEnum, withFlag } from "../utils/fieldEnums";

interface FlagsSelectProps {
  /** A table of bits, which `FieldEnum.flags` says it is. */
  held: FieldEnum;
  /** The number the file holds, as text. */
  text: string;
  onChange: (text: string) => void;
}

/**
 * A flags value as the bits it sets, picked from a menu of the engine's names.
 *
 * Each named bit is a switch that stays open for the next, and a bit no name covers stays
 * set through every toggle. The number the file holds sits beside the trigger.
 */
export function FlagsSelect({ held, text, onChange }: FlagsSelectProps) {
  const implicit = use(InputDefaultContext);
  const value = Number(text);
  const readable = Number.isSafeInteger(value);
  const reading = readable ? enumText(held, value) : null;

  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <Menu.Root>
        <Menu.Trigger
          disabled={!readable}
          /* DS-VEIL, DS-RADIUS */
          className={twMerge(
            "flex h-auto min-w-0 cursor-pointer items-center gap-1 rounded-sm border border-surface-veil bg-surface-veil-soft px-1.5 py-0.5 text-mono-row text-surface-200 hover:border-accent-hover",
            implicit && "border-dashed bg-transparent text-surface-400",
          )}
          onClick={(event: ReactMouseEvent<HTMLButtonElement>) => event.stopPropagation()}
        >
          <span className="min-w-0 truncate">{reading ?? m.workshop_bin_flags_none_label()}</span>
          <CaretDownIcon weight="bold" className="h-3 w-3 shrink-0 text-surface-400" />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner align="start">
            <Menu.Popup data-ui="FlagsSelect" className="min-w-48">
              {Object.entries(held.names).map(([name, bit]) => (
                <Menu.CheckboxItem
                  key={name}
                  checked={(value & bit) !== 0}
                  onCheckedChange={(on) => onChange(String(withFlag(value, bit, on)))}
                >
                  <span className="flex items-center justify-between gap-3">
                    {enumText(held, bit) ?? name}
                    {/* DS-CODE-CHIP */}
                    <Code className="text-surface-400">{`0x${bit.toString(16)}`}</Code>
                  </span>
                </Menu.CheckboxItem>
              ))}
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
      {/* DS-CODE-CHIP */}
      <Code
        className={twMerge("shrink-0 select-text", implicit && "bg-transparent text-surface-400")}
      >
        {text}
      </Code>
    </span>
  );
}
