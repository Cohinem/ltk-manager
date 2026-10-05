import { CaretDownIcon } from "@phosphor-icons/react";
import { useMemo } from "react";

import { twMerge } from "@/utils";

import { Combobox, useComboboxFilter } from "./Combobox";
import { fieldFrame, fieldSizeClasses } from "./fieldFrame";

export interface MultiSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface MultiSelectProps {
  options: MultiSelectOption[];
  selected: Set<string>;
  onChange: (selected: Set<string>) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  variant?: "compact" | "field";
}

export function MultiSelect({
  options,
  selected,
  onChange,
  label,
  placeholder,
  disabled,
  className,
  variant = "compact",
}: MultiSelectProps) {
  const filter = useComboboxFilter();

  const selectedOptions = useMemo(
    () => options.filter((o) => selected.has(o.value)),
    [options, selected],
  );

  const sortedItems = useMemo(() => {
    const sortByLabel = (a: MultiSelectOption, b: MultiSelectOption) =>
      a.label.localeCompare(b.label);
    const sel = options.filter((o) => selected.has(o.value)).sort(sortByLabel);
    const unsel = options.filter((o) => !selected.has(o.value)).sort(sortByLabel);
    return [...sel, ...unsel];
  }, [options, selected]);

  return (
    <Combobox.Root<MultiSelectOption, true>
      multiple
      value={selectedOptions}
      onValueChange={(opts) => onChange(new Set(opts.map((o) => o.value)))}
      items={sortedItems}
      filter={(item, query) => filter.contains(item, query, (o) => o.label)}
      itemToStringLabel={(item) => item.label}
      itemToStringValue={(item) => item.value}
      disabled={disabled}
    >
      {variant === "compact" ? (
        <Combobox.Trigger
          className={twMerge(
            "inline-flex items-center gap-2",
            fieldFrame,
            fieldSizeClasses.md,
            "w-auto text-surface-200",
            className,
          )}
        >
          {label && <span className="text-surface-300">{label}</span>}
          {selected.size > 0 && (
            <span className="rounded-full bg-accent-500/20 px-1.5 text-xs text-accent-400">
              {selected.size}
            </span>
          )}
          <CaretDownIcon weight="bold" className="size-3.5 text-surface-400" />
        </Combobox.Trigger>
      ) : (
        <Combobox.Trigger
          className={twMerge(
            "flex items-center gap-1.5",
            fieldFrame,
            /* Starts at the height of a `md` field, and grows with the chips it wraps. */
            "min-h-8 px-2.5 py-1 text-sm text-surface-200",
            className,
          )}
        >
          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
            {selectedOptions.length > 0 ? (
              selectedOptions.map((o) => (
                <span
                  key={o.value}
                  className="inline-flex items-center rounded-sm bg-surface-600 px-1.5 py-0.5 text-xs text-surface-200"
                >
                  {o.label}
                </span>
              ))
            ) : (
              <span className="text-surface-400">{label ?? "Select..."}</span>
            )}
          </span>
          <CaretDownIcon weight="bold" className="size-3.5 shrink-0 text-surface-400" />
        </Combobox.Trigger>
      )}
      <Combobox.Content
        side="bottom"
        sideOffset={4}
        positionerClassName="z-50"
        className={twMerge(
          "flex max-h-60 w-64 flex-col overflow-hidden rounded-lg border border-surface-600 shadow-xl",
          "animate-fade-in",
          "data-ending-style:opacity-0 data-starting-style:opacity-0",
        )}
      >
        <div className="shrink-0 border-b border-surface-600 p-2">
          <div className="flex rounded-md border border-surface-500 bg-surface-700 px-2.5 has-[:focus]:border-accent-500 has-[:focus]:ring-1 has-[:focus]:ring-accent-500">
            <Combobox.Input
              placeholder={placeholder}
              className="w-full rounded-none border-0 border-transparent bg-transparent px-0 py-1 text-sm text-surface-50 shadow-none outline-none placeholder:text-surface-400 hover:border-transparent focus:border-transparent focus:ring-0 focus:outline-none"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          <Combobox.List>
            {(item: MultiSelectOption) => (
              <Combobox.Item
                key={item.value}
                value={item}
                disabled={item.disabled}
                className={twMerge(
                  "text-surface-400 data-highlighted:bg-surface-600",
                  "data-selected:text-surface-100",
                )}
              >
                {item.label}
              </Combobox.Item>
            )}
          </Combobox.List>
          <Combobox.Empty>
            <p className="px-3 py-6 text-center text-sm text-surface-400">No results found</p>
          </Combobox.Empty>
        </div>
      </Combobox.Content>
    </Combobox.Root>
  );
}
MultiSelect.displayName = "MultiSelect";
