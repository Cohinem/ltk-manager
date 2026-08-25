import { PaletteIcon } from "@phosphor-icons/react";

import { SectionCard } from "@/components";
import type { Settings } from "@/lib/tauri";
import { useRotateAppMark } from "@/stores";

import { SettingGroup } from "../SettingGroup";
import { SettingRow } from "../SettingRow";
import { SettingScope } from "../SettingScope";
import { AccentColorPicker } from "./AccentColorPicker";
import { BackdropImagePicker } from "./BackdropImagePicker";
import { CornerStylePicker } from "./CornerStylePicker";
import { CodeFontPicker, InterfaceFontPicker } from "./FontPicker";
import { ReduceMotionPicker } from "./ReduceMotionPicker";
import { ResetAppearanceButton } from "./ResetAppearanceButton";
import { ScrollbarSizePicker } from "./ScrollbarSizePicker";
import { ScrollModePicker } from "./ScrollModePicker";
import { SurfaceTintPicker } from "./SurfaceTintPicker";
import { ThemePicker } from "./ThemePicker";
import { ZoomLevelPicker } from "./ZoomLevelPicker";

function MarkRotator() {
  const rotateAppMark = useRotateAppMark();

  return (
    <span
      className="group/rotator absolute right-0 bottom-0 size-5 p-1"
      onClick={rotateAppMark}
      aria-hidden
    >
      <span className="block size-full rounded-md transition duration-200 group-hover/rotator:bg-surface-veil group-hover/rotator:shadow-[0_0_10px] group-hover/rotator:shadow-accent-400/60 group-active/rotator:bg-surface-veil-strong" />
    </span>
  );
}

interface AppearanceSectionProps {
  settings: Settings;
  onSave: (settings: Settings) => void;
}

export function AppearanceSection({ settings, onSave }: AppearanceSectionProps) {
  return (
    <SettingScope>
      <SectionCard
        title="Appearance"
        icon={<PaletteIcon className="h-5 w-5" />}
        description="Options for how the app looks"
        action={<ResetAppearanceButton />}
        panelClassName="relative"
      >
        <SettingGroup id="color" title="Color">
          <SettingRow
            kind="action"
            title="Theme"
            setting="theme"
            control={<ThemePicker settings={settings} onSave={onSave} />}
          />

          <SettingRow
            kind="action"
            title="Accent color"
            setting="accentColor"
            hint="The last swatch opens a hue slider for a color of your own."
            control={<AccentColorPicker settings={settings} onSave={onSave} />}
          />

          <SettingRow
            kind="action"
            title="Surface tint"
            setting="display.surfaceTint"
            description="How much of the accent color carries into panels and backgrounds."
            hint="At 0% every surface is a neutral grey and only the accent itself holds color."
            controlClassName="w-72 shrink"
            control={<SurfaceTintPicker />}
          />
        </SettingGroup>

        <SettingGroup id="shape-and-scale" title="Shape and scale">
          <SettingRow
            kind="action"
            title="Corners"
            setting="display.cornerStyle"
            description="How rounded every panel, button and card is."
            control={<CornerStylePicker />}
          />

          <SettingRow
            kind="action"
            title="Zoom level"
            setting="display.zoomLevel"
            description="Scales the whole interface."
            hint="Click the percentage to type an exact level. Ctrl+Plus and Ctrl+Minus step the zoom from anywhere, and Ctrl+0 returns to 100%."
            controlClassName="w-72 shrink"
            control={<ZoomLevelPicker />}
          />
        </SettingGroup>

        <SettingGroup id="text" title="Text">
          <SettingRow
            kind="action"
            title="Interface font"
            setting="display.sansFont"
            control={<InterfaceFontPicker />}
          />

          <SettingRow
            kind="action"
            title="Code font"
            setting="display.monoFont"
            hint="Each face is measured against the interface font so the two sit level."
            control={<CodeFontPicker />}
          />
        </SettingGroup>

        <SettingGroup id="motion" title="Motion">
          <SettingRow
            kind="action"
            title="Reduce motion"
            setting="display.reduceMotion"
            hint="System follows your OS preference. On disables animations, off always animates."
            control={<ReduceMotionPicker />}
          />

          <SettingRow
            kind="action"
            title="Scrolling"
            setting="display.scrollMode"
            hint="Spring rubber-bands when a list is pushed past its end."
            control={<ScrollModePicker />}
          />

          <SettingRow
            kind="action"
            title="Scrollbars"
            setting="display.scrollbarSize"
            description="How thick every scrollbar draws."
            control={<ScrollbarSizePicker />}
          />
        </SettingGroup>

        <SettingGroup id="backdrop" title="Backdrop">
          <BackdropImagePicker settings={settings} onSave={onSave} />
        </SettingGroup>

        <MarkRotator />
      </SectionCard>
    </SettingScope>
  );
}
