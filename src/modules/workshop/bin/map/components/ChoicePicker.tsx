import { Combobox, useComboboxFilter } from "@/components";

/** One value a picker offers, with what it reads as. */
export interface Choice {
  readonly value: string;
  readonly label: string;
}

export interface ChoicePickerProps {
  readonly choices: readonly Choice[];
  /** The value picked now, and one no choice holds reads as itself. */
  readonly value: string;
  readonly onPick: (value: string) => void;
  /** The field's accessible name. */
  readonly label: string;
  readonly empty: string;
  readonly disabled?: boolean;
}

/** A searchable list of values, such as a mesh's material or region, with one picked. */
export function ChoicePicker({
  choices,
  value,
  onPick,
  label,
  empty,
  disabled,
}: ChoicePickerProps) {
  const filter = useComboboxFilter();
  const selected = choices.find((choice) => choice.value === value) ?? {
    value,
    label: value,
  };

  return (
    <Combobox.Root<Choice>
      items={[...choices]}
      value={selected}
      onValueChange={(choice) => {
        if (choice !== null && choice.value !== value) onPick(choice.value);
      }}
      disabled={disabled}
      itemToStringLabel={(choice) => choice.label}
      itemToStringValue={(choice) => choice.value}
      isItemEqualToValue={(choice, chosen) => choice.value === chosen.value}
      filter={(choice, query) => filter.contains(choice, query, (item) => item.label)}
    >
      <div className="relative min-w-0 flex-1" data-ui="ChoicePicker">
        <Combobox.Input aria-label={label} className="pr-8 font-mono text-mono-row" />
        <Combobox.Trigger className="absolute top-0 right-0 flex h-full items-center pr-3">
          <Combobox.Icon />
        </Combobox.Trigger>
      </div>
      <Combobox.Content positionerClassName="min-w-(--anchor-width)" className="max-h-72">
        <Combobox.List>
          {(choice: Choice) => (
            <Combobox.Item key={choice.value} value={choice}>
              <span className="min-w-0 flex-1 truncate font-mono text-mono-row">
                {choice.label}
              </span>
            </Combobox.Item>
          )}
        </Combobox.List>
        <Combobox.Empty>{empty}</Combobox.Empty>
      </Combobox.Content>
    </Combobox.Root>
  );
}
