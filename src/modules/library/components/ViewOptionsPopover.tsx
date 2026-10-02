import { SlidersHorizontalIcon } from "@phosphor-icons/react";

import { Checkbox, FilterSection, IconButton, Popover, Slider, Tooltip } from "@/components";
import { useSettings, useUpdateSettings } from "@/modules/settings";
import { type CardScale, useCardScale, useSetCardScale, VALID_CARD_SCALES } from "@/stores";

const SCALE_MARKS = VALID_CARD_SCALES.map((value) => ({ value }));
const MIN_SCALE = VALID_CARD_SCALES[0];
const MAX_SCALE = VALID_CARD_SCALES[VALID_CARD_SCALES.length - 1];

/** Card size and what a card shows, behind the view toggle's caret. Sliders, not a kebab: DS-GLYPH-ROLE. */
export function ViewOptionsPopover() {
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const cardScale = useCardScale();
  const setCardScale = useSetCardScale();

  if (!settings) return null;

  return (
    <Popover.Root>
      <Tooltip content="View options">
        <Popover.Trigger
          render={
            <IconButton
              icon={<SlidersHorizontalIcon />}
              size="sm"
              aria-label="View options"
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
        aria-label="View options"
        className="w-64 divide-y divide-surface-600/50 bg-surface-900 p-0 select-none"
      >
        <FilterSection title="Card size">
          <Slider
            variant="ruler"
            value={cardScale}
            onValueChange={(value) => setCardScale(value as CardScale)}
            min={MIN_SCALE}
            max={MAX_SCALE}
            step={10}
            marks={SCALE_MARKS}
            aria-label="Card size"
          />
        </FilterSection>

        <FilterSection title="Card display">
          <Checkbox
            size="sm"
            label="Tags"
            checked={settings.showModTags}
            onCheckedChange={(checked) => updateSettings({ showModTags: checked })}
          />
        </FilterSection>
      </Popover.Content>
    </Popover.Root>
  );
}
