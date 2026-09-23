import { CaretDownIcon, CubeTransparentIcon } from "@phosphor-icons/react";

import { Button, Menu } from "@/components";
import { m } from "@/i18n";
import { takesWireOverlay, VIEW_MODES, type ViewMode } from "@/modules/viewport";
import { usePreviewViewMode, usePreviewWireOverlay, useSetPreviewDisplay } from "@/stores";

const MODE_LABEL: Record<ViewMode, () => string> = {
  lit: m.workshop_bin_preview_view_lit_label,
  unshaded: m.workshop_bin_preview_view_unshaded_label,
  untextured: m.workshop_bin_preview_view_untextured_label,
  wireframe: m.workshop_bin_preview_view_wireframe_label,
};

/** The preview's view mode, and the wireframe overlay a lit or untextured mode takes. */
export function ViewModeMenu() {
  const mode = usePreviewViewMode();
  const overlay = usePreviewWireOverlay();
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
            <Menu.RadioGroup
              value={mode}
              onValueChange={(each) => setDisplay({ previewViewMode: each as ViewMode })}
            >
              {VIEW_MODES.map((each) => (
                <Menu.RadioItem key={each} value={each}>
                  {MODE_LABEL[each]()}
                </Menu.RadioItem>
              ))}
            </Menu.RadioGroup>
            <Menu.Separator />
            <Menu.CheckboxItem
              checked={overlay && takesWireOverlay(mode)}
              disabled={!takesWireOverlay(mode)}
              onCheckedChange={(checked) => setDisplay({ previewWireOverlay: checked })}
            >
              {m.workshop_bin_preview_view_wire_overlay_label()}
            </Menu.CheckboxItem>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
