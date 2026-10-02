import { SlidersHorizontalIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import {
  ArrangedTableOptions,
  Checkbox,
  FilterSection,
  IconButton,
  Popover,
  Slider,
  Tooltip,
} from "@/components";
import { m } from "@/i18n";
import { useLibraryViewMode } from "@/modules/library/api";
import { useSettings, useUpdateSettings } from "@/modules/settings";
import { type CardScale, useCardScale, useSetCardScale, VALID_CARD_SCALES } from "@/stores";

import { useLibraryTableStore } from "../state";
import { COLUMN_SPECS, GROUP_BY_LABELS } from "./ModTable/columns";

const SCALE_MARKS = VALID_CARD_SCALES.map((value) => ({ value }));
const MIN_SCALE = VALID_CARD_SCALES[0];
const MAX_SCALE = VALID_CARD_SCALES[VALID_CARD_SCALES.length - 1];

/**
 * How the library is drawn, behind the view toggle's caret: card size for the
 * grid, rows, columns and grouping for the table. Sliders, not a kebab:
 * DS-GLYPH-ROLE.
 */
export function ViewOptionsPopover({
  viewMode: shownMode,
  tableOptions = <LibraryTableOptions />,
}: {
  /** The view the options are for, the library's own unless another page says. */
  viewMode?: "grid" | "table";
  /** The table's sections, the library table's unless another page draws its own. */
  tableOptions?: ReactNode;
} = {}) {
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const { viewMode: libraryMode } = useLibraryViewMode();
  const viewMode = shownMode ?? libraryMode;

  if (!settings) return null;

  return (
    <Popover.Root>
      <Tooltip content={m.library_view_options_label()}>
        <Popover.Trigger
          render={
            <IconButton
              icon={<SlidersHorizontalIcon />}
              size="sm"
              aria-label={m.library_view_options_label()}
              className="h-full w-auto rounded-none px-1"
            />
          }
        />
      </Tooltip>
      {/* A rung under the DS-GROUND default for floating UI, so it reads apart
          from the surface-800 toolbar it drops out of. */}
      <Popover.Content
        side="bottom"
        align="end"
        sideOffset={8}
        aria-label={m.library_view_options_label()}
        className="w-72 divide-y divide-surface-600/50 bg-surface-900 p-0 select-none"
      >
        {viewMode === "grid" && <CardSize />}
        {viewMode === "table" && tableOptions}

        {viewMode === "grid" && (
          <FilterSection title={m.library_view_card_display_label()}>
            <Checkbox
              size="sm"
              label={m.library_view_tags_label()}
              checked={settings.showModTags}
              onCheckedChange={(checked) => updateSettings({ showModTags: checked })}
            />
          </FilterSection>
        )}
      </Popover.Content>
    </Popover.Root>
  );
}

function CardSize() {
  const cardScale = useCardScale();
  const setCardScale = useSetCardScale();

  return (
    <FilterSection title={m.library_view_card_size_label()}>
      <Slider
        variant="ruler"
        value={cardScale}
        onValueChange={(value) => setCardScale(value as CardScale)}
        min={MIN_SCALE}
        max={MAX_SCALE}
        step={10}
        marks={SCALE_MARKS}
        aria-label={m.library_view_card_size_label()}
      />
    </FilterSection>
  );
}

function LibraryTableOptions() {
  return (
    <ArrangedTableOptions
      store={useLibraryTableStore}
      specs={COLUMN_SPECS}
      groupLabels={GROUP_BY_LABELS}
    />
  );
}
