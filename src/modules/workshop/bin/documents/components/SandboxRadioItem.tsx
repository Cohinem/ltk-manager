import { type ReactNode, useId } from "react";

import { Menu, type MenuCheckboxItemProps, type MenuRadioItemProps } from "@/components";

interface OptionText {
  /** What the choice does, or why it is disabled. Read out as the item's description. */
  note?: string;
  children: ReactNode;
}

/** One choice of the Sandbox options: its label, and a note under it. */
export function SandboxRadioItem({
  note,
  children,
  ...props
}: Omit<MenuRadioItemProps, "children"> & OptionText) {
  const ids = useOptionIds(note);

  return (
    <Menu.RadioItem aria-labelledby={ids.label} aria-describedby={ids.note} {...props}>
      <OptionBody ids={ids} note={note}>
        {children}
      </OptionBody>
    </Menu.RadioItem>
  );
}

/** One switch of the Sandbox options: its label, and a note under it. */
export function SandboxCheckboxItem({
  note,
  children,
  ...props
}: Omit<MenuCheckboxItemProps, "children"> & OptionText) {
  const ids = useOptionIds(note);

  return (
    <Menu.CheckboxItem aria-labelledby={ids.label} aria-describedby={ids.note} {...props}>
      <OptionBody ids={ids} note={note}>
        {children}
      </OptionBody>
    </Menu.CheckboxItem>
  );
}

interface OptionIds {
  label: string;
  note: string | undefined;
}

function useOptionIds(note: string | undefined): OptionIds {
  const id = useId();
  return { label: `${id}-label`, note: note === undefined ? undefined : `${id}-note` };
}

function OptionBody({ ids, note, children }: OptionText & { ids: OptionIds }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span id={ids.label} className="truncate">
        {children}
      </span>
      {note !== undefined && (
        <span id={ids.note} className="text-meta text-surface-400">
          {note}
        </span>
      )}
    </span>
  );
}
