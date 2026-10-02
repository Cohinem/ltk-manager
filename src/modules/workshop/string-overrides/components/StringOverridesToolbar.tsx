import { CaretDownIcon, TranslateIcon } from "@phosphor-icons/react";
import { useRef } from "react";

import { Count, Menu, SearchField, Tooltip } from "@/components";
import { twMerge } from "@/utils";

import { stringsDocument } from "../../documents/utils/contentDocument";
import { useProjectContext } from "../../projects/state/ProjectContext";
import { useOpenDocument } from "../../state";
import { LOCALES } from "../model/constants";

interface StringOverridesToolbarProps {
  layerName: string;
  locale: string;
  filter: string;
  onFilterChange: (filter: string) => void;
  /** Rows the filter leaves on screen, against `total` for the count line. */
  shown: number;
  total: number;
}

/** The document's toolbar row: which locale this is, the filter, the count. */
export function StringOverridesToolbar({
  layerName,
  locale,
  filter,
  onFilterChange,
  shown,
  total,
}: StringOverridesToolbarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <LocaleMenu layerName={layerName} locale={locale} />

      <SearchField
        value={filter}
        onChange={onFilterChange}
        label="Filter the overrides"
        clearLabel="Clear the filter"
        inputRef={inputRef}
      />

      {total > 0 && <Count>{countText(shown, total)}</Count>}
    </>
  );
}

function countText(shown: number, total: number): string {
  if (shown < total) return `${shown} of ${total} shown`;
  return total === 1 ? "1 override" : `${total} overrides`;
}

interface LocaleMenuProps {
  layerName: string;
  locale: string;
}

/* Every locale the game ships, counts alongside, switching the document in
   place rather than through the sidebar. */
function LocaleMenu({ layerName, locale }: LocaleMenuProps) {
  const project = useProjectContext();
  const openDocument = useOpenDocument();

  const overrides =
    project.layers.find((candidate) => candidate.name === layerName)?.stringOverrides ?? {};
  const current = LOCALES.find((candidate) => candidate.value === locale);

  return (
    <Menu.Root>
      <Tooltip content="Switch locale">
        <Menu.Trigger
          render={
            <button
              type="button"
              className={twMerge(
                "flex h-6 shrink-0 cursor-pointer items-center gap-1 rounded-sm px-1.5 text-xs text-surface-200 transition-colors select-none",
                /* DS-VEIL */ "hover:bg-surface-veil hover:text-surface-100",
              )}
            >
              <TranslateIcon className="size-3.5 text-doc-strings-text" />
              {current?.label ?? locale}
              <CaretDownIcon className="size-3 text-surface-400" />
            </button>
          }
        />
      </Tooltip>
      <Menu.Content align="start" sideOffset={4} className="max-h-80 overflow-y-auto">
        {LOCALES.map((candidate) => {
          const count = Object.keys(overrides[candidate.value] ?? {}).length;

          return (
            <Menu.Item
              key={candidate.value}
              shortcut={count > 0 ? String(count) : undefined}
              onClick={() => openDocument(stringsDocument(layerName, candidate.value))}
            >
              <span className={candidate.value === locale ? "text-accent-300" : undefined}>
                {candidate.label}
              </span>
            </Menu.Item>
          );
        })}
      </Menu.Content>
    </Menu.Root>
  );
}
