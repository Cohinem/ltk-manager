import { useMemo, useState } from "react";

import { Combobox } from "@/components";

interface LinePickerProps<T> {
  /** The input's placeholder and accessible name. */
  label: string;
  items: readonly T[];
  itemKey: (item: T) => string;
  itemText: (item: T) => string;
  onPick: (item: T) => void;
  /** Runs when the list opens, for a caller that reads its items on demand. */
  onOpen?: () => void;
  disabled?: boolean;
}

/* DS-VEIL, DS-HOVER, DS-RADIUS */
const LINE_INPUT =
  "h-6 w-full min-w-0 rounded-sm border border-transparent bg-transparent px-1.5 text-surface-200 placeholder:text-surface-400 hover:border-accent-hover focus:border-accent-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50";

/** A one-line combobox that picks one item and then clears, for Add field and a class change. */
export function LinePicker<T>({
  label,
  items,
  itemKey,
  itemText,
  onPick,
  onOpen,
  disabled = false,
}: LinePickerProps<T>) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const shown = useMemo(() => {
    const wanted = text.trim().toLowerCase();
    if (wanted === "") return items;
    return items.filter((item) => itemText(item).toLowerCase().includes(wanted));
  }, [items, text, itemText]);

  const show = (next: boolean) => {
    setOpen(next);
    if (next) onOpen?.();
  };

  return (
    <Combobox.Root<T>
      items={shown}
      inputValue={text}
      onInputValueChange={(next, details) => {
        if (details.reason === "input-clear" || details.reason === "none") return;
        setText(next);
      }}
      onValueChange={(item) => {
        if (item === null) return;
        setText("");
        onPick(item);
      }}
      open={open && shown.length > 0}
      onOpenChange={show}
      filter={() => true}
      autoHighlight
      itemToStringLabel={itemText}
      itemToStringValue={itemKey}
    >
      <Combobox.Input
        placeholder={label}
        aria-label={label}
        disabled={disabled}
        spellCheck={false}
        autoComplete="off"
        className={LINE_INPUT}
        onFocus={() => show(true)}
      />
      <Combobox.Portal>
        <Combobox.Positioner side="bottom" align="start" sideOffset={2}>
          <Combobox.Popup className="max-h-64 min-w-64 py-0.5">
            <Combobox.List>
              {(item: T) => (
                <Combobox.Item key={itemKey(item)} value={item} className="px-2 py-1 text-row">
                  {itemText(item)}
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
