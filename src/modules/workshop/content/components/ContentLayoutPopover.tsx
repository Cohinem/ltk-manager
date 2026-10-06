import { SidebarSimpleIcon } from "@phosphor-icons/react";

import {
  Button,
  Checkbox,
  FilterSection,
  IconButton,
  Popover,
  SegmentedControl,
  Tooltip,
} from "@/components";
import {
  useLayerPanelOpen,
  useLayerPanelSide,
  useSetLayerPanelOpen,
  useSetLayerPanelSide,
} from "@/stores";

import { useResetLayout } from "../../state";

const SIDE_OPTIONS = [
  { value: "left" as const, label: "Left" },
  { value: "right" as const, label: "Right" },
];

/** Which edge the primary side panel docks to, and whether it shows at all. */
export function ContentLayoutPopover() {
  const layerPanelSide = useLayerPanelSide();
  const setLayerPanelSide = useSetLayerPanelSide();
  const layerPanelOpen = useLayerPanelOpen();
  const setLayerPanelOpen = useSetLayerPanelOpen();
  const resetLayout = useResetLayout();

  return (
    <Popover.Root>
      <Tooltip content="Layout">
        <Popover.Trigger
          render={<IconButton icon={<SidebarSimpleIcon />} size="sm" aria-label="Layout options" />}
        />
      </Tooltip>
      <Popover.Content
        side="bottom"
        align="end"
        sideOffset={8}
        aria-label="Layout options"
        className="w-56 divide-y divide-surface-700 p-0 select-none"
      >
        <FilterSection>
          <Checkbox
            size="sm"
            label="Show side panel"
            checked={layerPanelOpen}
            onCheckedChange={setLayerPanelOpen}
          />
        </FilterSection>

        {layerPanelOpen && (
          <FilterSection title="Side panel position">
            <SegmentedControl
              options={SIDE_OPTIONS}
              value={layerPanelSide}
              onChange={setLayerPanelSide}
            />
          </FilterSection>
        )}

        <FilterSection>
          <Button variant="outline" className="w-full" onClick={resetLayout}>
            Reset layout
          </Button>
        </FilterSection>
      </Popover.Content>
    </Popover.Root>
  );
}
