import { useMemo, useState } from "react";

import { Combobox } from "@/components";

export interface JointPickerProps {
  /** The input's accessible name. */
  readonly label: string;
  /** Every joint of the skeleton, by name. */
  readonly joints: readonly string[];
  /** The joint held now, and null for none. */
  readonly value: string | null;
  readonly onPick: (joint: string) => void;
  readonly disabled?: boolean;
  /** The text shown while no joint is held. */
  readonly placeholder?: string;
}

/* DS-HOVER, DS-RADIUS */
const LINE_INPUT =
  "h-6 w-full min-w-0 rounded-sm border border-transparent bg-transparent px-1.5 font-sans text-row text-surface-200 placeholder:text-surface-400 hover:border-accent-hover focus:border-accent-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50";

/**
 * A one-line combobox that holds a joint of the skeleton.
 *
 * It reads as the joint it holds. Typing narrows the skeleton's joints by name, and a
 * pick or a close puts the held joint's name back.
 */
export function JointPicker({
  label,
  joints,
  value,
  onPick,
  disabled = false,
  placeholder,
}: JointPickerProps) {
  /* What the reader typed, and null while the input shows the held joint. */
  const [typed, setTyped] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const shown = useMemo(() => {
    const wanted = (typed ?? "").trim().toLowerCase();
    if (wanted === "") return joints;
    return joints.filter((joint) => joint.toLowerCase().includes(wanted));
  }, [joints, typed]);

  const show = (next: boolean) => {
    setOpen(next);
    if (!next) setTyped(null);
  };

  return (
    <Combobox.Root<string>
      items={shown}
      value={value}
      inputValue={typed ?? value ?? ""}
      onInputValueChange={(next, details) => {
        if (details.reason === "input-clear" || details.reason === "none") return;
        setTyped(next);
      }}
      onValueChange={(joint) => {
        if (joint === null) return;
        setTyped(null);
        onPick(joint);
      }}
      open={open && shown.length > 0}
      onOpenChange={show}
      filter={() => true}
      autoHighlight
    >
      <Combobox.Input
        aria-label={label}
        disabled={disabled}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        className={LINE_INPUT}
        onFocus={(event) => {
          show(true);
          event.currentTarget.select();
        }}
      />
      <Combobox.Content side="bottom" align="start" sideOffset={2} className="max-h-64 min-w-64">
        <Combobox.List>
          {(joint: string) => (
            <Combobox.Item key={joint} value={joint} className="font-sans text-row">
              {joint}
            </Combobox.Item>
          )}
        </Combobox.List>
      </Combobox.Content>
    </Combobox.Root>
  );
}
