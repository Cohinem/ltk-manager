import { CaretDownIcon, CheckIcon, CubeTransparentIcon } from "@phosphor-icons/react";

import { Button, Menu } from "@/components";
import { m } from "@/i18n";
import { VIEW_MODES, type ViewMode } from "@/modules/viewport";
import { usePreviewViewMode, useSetPreviewDisplay } from "@/stores";

const MODE_LABEL: Record<ViewMode, () => string> = {
  lit: m.workshop_bin_preview_view_lit_label,
  unshaded: m.workshop_bin_preview_view_unshaded_label,
  wireframe: m.workshop_bin_preview_view_wireframe_label,
  overlay: m.workshop_bin_preview_view_overlay_label,
};

/** How the preview draws its meshes: lit, unshaded, as their edges, or edges over lit. */
export function ViewModeMenu() {
  const mode = usePreviewViewMode();
  const setDisplay = useSetPreviewDisplay();

  return (
    <Menu.Root>
      <Menu.Trigger
        render={
          <Button
            variant="ghost"
            size="xs"
            compact
            aria-label={m.workshop_bin_preview_view_label()}
            left={<CubeTransparentIcon weight="bold" className="h-4 w-4" />}
            right={<CaretDownIcon weight="bold" className="h-3 w-3" />}
          >
            {MODE_LABEL[mode]()}
          </Button>
        }
      />
      <Menu.Portal>
        <Menu.Positioner align="end">
          <Menu.Popup data-ui="ViewModeMenu" className="w-48">
            {VIEW_MODES.map((each) => (
              <Menu.Item
                key={each}
                icon={each === mode && <CheckIcon weight="bold" className="h-4 w-4" />}
                onClick={() => setDisplay({ previewViewMode: each })}
              >
                {MODE_LABEL[each]()}
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
