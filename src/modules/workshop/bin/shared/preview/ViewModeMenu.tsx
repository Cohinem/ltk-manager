import { CaretDownIcon, CubeTransparentIcon } from "@phosphor-icons/react";

import { Button, Menu } from "@/components";
import { m } from "@/i18n";
import {
  ANTI_ALIASING_MODES,
  type AntiAliasing,
  takesWireOverlay,
  VIEW_MODES,
  type ViewMode,
} from "@/modules/viewport";
import {
  type PreviewEffectsQuality,
  usePreviewAntiAliasing,
  usePreviewEffectsQuality,
  usePreviewViewMode,
  usePreviewWireOverlay,
  useSetPreviewDisplay,
} from "@/stores";

const MODE_LABEL: Record<ViewMode, () => string> = {
  lit: m.workshop_bin_preview_view_lit_label,
  unshaded: m.workshop_bin_preview_view_unshaded_label,
  untextured: m.workshop_bin_preview_view_untextured_label,
  wireframe: m.workshop_bin_preview_view_wireframe_label,
};

/** Every Effects Quality level, lowest first, as the client's settings list them. */
const QUALITIES: readonly PreviewEffectsQuality[] = [0, 1, 2, 3, 4];

const QUALITY_LABEL: Record<PreviewEffectsQuality, () => string> = {
  0: m.workshop_bin_preview_effects_quality_very_low_label,
  1: m.workshop_bin_preview_effects_quality_low_label,
  2: m.workshop_bin_preview_effects_quality_medium_label,
  3: m.workshop_bin_preview_effects_quality_high_label,
  4: m.workshop_bin_preview_effects_quality_very_high_label,
};

const ANTI_ALIASING_LABEL: Record<AntiAliasing, () => string> = {
  off: m.workshop_bin_preview_anti_aliasing_off_label,
  fxaa: m.workshop_bin_preview_anti_aliasing_fxaa_label,
  smaa: m.workshop_bin_preview_anti_aliasing_smaa_label,
};

/**
 * The preview's view mode, the wireframe overlay a lit or untextured mode takes, how the
 * frame's edges are smoothed, and the client's Effects Quality that every particle preview
 * simulates.
 */
export function ViewModeMenu() {
  const mode = usePreviewViewMode();
  const overlay = usePreviewWireOverlay();
  const antiAliasing = usePreviewAntiAliasing();
  const quality = usePreviewEffectsQuality();
  const setDisplay = useSetPreviewDisplay();

  return (
    <Menu.Root>
      <Menu.Trigger
        render={
          <Button
            variant="ghost"
            size="xs"
            aria-label={m.workshop_bin_preview_view_label()}
            left={<CubeTransparentIcon weight="bold" className="size-4" />}
            right={<CaretDownIcon weight="bold" className="size-3" />}
          >
            {MODE_LABEL[mode]()}
          </Button>
        }
      />
      <Menu.Content align="end" data-ui="ViewModeMenu" className="w-48">
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
        <Menu.Separator />
        <Menu.SubmenuRoot>
          <Menu.SubmenuTrigger>{m.workshop_bin_preview_anti_aliasing_label()}</Menu.SubmenuTrigger>
          <Menu.SubmenuContent data-ui="ViewModeMenu:antiAliasing">
            <Menu.RadioGroup
              value={antiAliasing}
              onValueChange={(each) => setDisplay({ previewAntiAliasing: each as AntiAliasing })}
            >
              {ANTI_ALIASING_MODES.map((each) => (
                <Menu.RadioItem key={each} value={each}>
                  {ANTI_ALIASING_LABEL[each]()}
                </Menu.RadioItem>
              ))}
            </Menu.RadioGroup>
          </Menu.SubmenuContent>
        </Menu.SubmenuRoot>
        <Menu.SubmenuRoot>
          <Menu.SubmenuTrigger>
            {m.workshop_bin_preview_effects_quality_label()}
          </Menu.SubmenuTrigger>
          <Menu.SubmenuContent data-ui="ViewModeMenu:effectsQuality">
            <Menu.RadioGroup
              value={quality}
              onValueChange={(each) =>
                setDisplay({ previewEffectsQuality: each as PreviewEffectsQuality })
              }
            >
              {QUALITIES.map((each) => (
                <Menu.RadioItem key={each} value={each}>
                  {QUALITY_LABEL[each]()}
                </Menu.RadioItem>
              ))}
            </Menu.RadioGroup>
          </Menu.SubmenuContent>
        </Menu.SubmenuRoot>
      </Menu.Content>
    </Menu.Root>
  );
}
