import { PlusIcon } from "@phosphor-icons/react";
import { useMemo, useRef, useState } from "react";

import { CATEGORY_TONE, Combobox } from "@/components";
import { m } from "@/i18n";
import { twMerge } from "@/utils";

import { useChampionRoster } from "../api";
import {
  type ChampionOption,
  championOptions,
  createdOption,
  selectedOptions,
} from "../utils/roster";
import { ChampionPortrait } from "./ChampionPortrait";

export interface ChampionPickerProps {
  /** A mod's or a project's `champions`, in order. */
  readonly value: readonly string[];
  readonly onChange: (champions: string[]) => void;
  readonly "aria-label": string;
  readonly className?: string;
}

/**
 * The champions a mod or a project names, as chips in a field that searches the install's
 * champions.
 *
 * A pick stores the name categorization writes, and a value no champion answers to stays as
 * written. A typed name that matches no row is added through a row of its own, so the field still works
 * where no install is configured.
 */
export function ChampionPicker({
  value,
  onChange,
  "aria-label": ariaLabel,
  className,
}: ChampionPickerProps) {
  const roster = useChampionRoster();
  const field = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");

  const options = useMemo(() => championOptions(roster, value), [roster, value]);
  const selected = useMemo(() => selectedOptions(roster, options, value), [roster, options, value]);
  const items = useMemo(() => {
    const created = createdOption(roster, options, query);
    return created ? [created, ...options] : options;
  }, [roster, options, query]);

  return (
    <Combobox.Root<ChampionOption, true>
      multiple
      items={items}
      value={selected}
      onValueChange={(next) => {
        onChange(next.map((option) => option.value));
        setQuery("");
      }}
      inputValue={query}
      onInputValueChange={setQuery}
      filter={(option, search) =>
        option.created === true || option.search.includes(search.trim().toLowerCase())
      }
      itemToStringLabel={(option) => option.label}
      itemToStringValue={(option) => option.key}
      isItemEqualToValue={(option, chosen) => option.key === chosen.key}
    >
      <Combobox.Chips
        ref={field}
        data-ui="ChampionPicker"
        className={twMerge(
          "min-h-10 w-full items-center rounded-md border border-surface-500 bg-surface-700 px-1.5 py-1.5 transition-colors",
          /* DS-HOVER */
          "focus-within:border-accent-500 focus-within:ring-1 focus-within:ring-accent-500 hover:border-accent-hover",
          className,
        )}
      >
        <Combobox.Value>
          {(chips: ChampionOption[]) =>
            chips.map((option) => (
              <Combobox.Chip
                key={option.key}
                aria-label={option.label}
                className={twMerge(
                  "gap-1 rounded-full py-0.5 pr-1 pl-0.5 text-meta select-none",
                  CATEGORY_TONE.champion,
                )}
              >
                <ChampionPortrait champion={option.champion} className="size-4" />
                {option.label}
                {/* DS-VEIL */}
                <Combobox.ChipRemove
                  aria-label={m.common_chip_remove_action({ label: option.label })}
                  className="rounded-full text-current hover:bg-surface-veil hover:text-current"
                />
              </Combobox.Chip>
            ))
          }
        </Combobox.Value>
        <Combobox.Input
          aria-label={ariaLabel}
          placeholder={value.length === 0 ? m.champions_picker_placeholder() : undefined}
          className="h-6 min-w-24 flex-1 rounded-none border-0 bg-transparent px-1.5 hover:border-transparent focus:border-transparent focus:ring-0"
        />
      </Combobox.Chips>
      <Combobox.Content
        anchor={field}
        positionerClassName="w-(--anchor-width)"
        className="max-h-72 select-none"
      >
        <Combobox.Empty>{m.champions_picker_empty()}</Combobox.Empty>
        <Combobox.List>
          {(option: ChampionOption) => (
            <Combobox.Item key={option.key} value={option}>
              <ChampionRow option={option} />
            </Combobox.Item>
          )}
        </Combobox.List>
      </Combobox.Content>
    </Combobox.Root>
  );
}

function ChampionRow({ option }: { option: ChampionOption }) {
  if (option.created) {
    return (
      <>
        <PlusIcon weight="bold" className="size-5 shrink-0 p-0.5 text-surface-400" />
        <span className="min-w-0 truncate">
          {m.champions_picker_add_action({ name: option.label })}
        </span>
      </>
    );
  }

  return (
    <>
      <ChampionPortrait champion={option.champion} className="size-5" />
      <span className="min-w-0 truncate">{option.label}</span>
    </>
  );
}
