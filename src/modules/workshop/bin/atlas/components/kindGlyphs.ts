import {
  ArrowsClockwiseIcon,
  CircleHalfIcon,
  CircleNotchIcon,
  ClockClockwiseIcon,
  CropIcon,
  CursorClickIcon,
  DotsSixIcon,
  DropHalfIcon,
  FilmStripIcon,
  FrameCornersIcon,
  GaugeIcon,
  HourglassIcon,
  type Icon,
  ImageSquareIcon,
  LineSegmentIcon,
  PaintBucketIcon,
  RowsIcon,
  SelectionIcon,
  SlidersHorizontalIcon,
  SparkleIcon,
  SpinnerIcon,
  SquaresFourIcon,
  StackIcon,
  SunHorizonIcon,
  SunIcon,
  TextTIcon,
  TimerIcon,
} from "@phosphor-icons/react";

import { m } from "@/i18n";

import type { KindCategory } from "../engine/model/elementKinds";

const KIND_ICON: Readonly<Record<string, Icon>> = {
  UiElementIconData: ImageSquareIcon,
  UiElementTextData: TextTIcon,
  UiElementRegionData: SelectionIcon,
  UiElementScissorRegionData: CropIcon,
  UiElementParticleSystemData: SparkleIcon,
  UiElementGroupData: SquaresFourIcon,
  UiElementGroupManagedLayoutData: RowsIcon,
  UiElementGroupFramedData: FrameCornersIcon,
  UiElementGroupButtonData: CursorClickIcon,
  UiElementGroupSliderData: SlidersHorizontalIcon,
  UiElementGroupMeterData: GaugeIcon,
  UiElementEffectAnimationData: FilmStripIcon,
  UiElementEffectCooldownData: HourglassIcon,
  UiElementEffectCooldownRadialData: ClockClockwiseIcon,
  UiElementEffectCircleMaskCooldownData: TimerIcon,
  UiElementEffectAmmoData: DotsSixIcon,
  UiElementEffectFillPercentageData: PaintBucketIcon,
  UiElementEffectArcFillData: CircleNotchIcon,
  UiElementEffectGlowData: SunIcon,
  UiElementEffectLineData: LineSegmentIcon,
  UiElementEffectDesaturateData: DropHalfIcon,
  UiElementEffectCircleMaskDesaturateData: CircleHalfIcon,
  UiElementEffectInstancedData: StackIcon,
  UiElementEffectRotatingIconData: ArrowsClockwiseIcon,
  UiElementEffectAnimatedRotatingIconData: SpinnerIcon,
  UiElementEffectGlowingRotatingIconData: SunHorizonIcon,
};

/** Returns the glyph of the element class `kind`. */
export function kindGlyph(kind: string): Icon {
  return KIND_ICON[kind] ?? SelectionIcon;
}

/** The heading of each kind category, in the components pane and the Insert menu. */
export const CATEGORY_TITLE: Record<KindCategory, () => string> = {
  basic: m.workshop_bin_atlas_add_category_basic_label,
  group: m.workshop_bin_atlas_add_category_group_label,
  control: m.workshop_bin_atlas_add_category_control_label,
  effect: m.workshop_bin_atlas_add_category_effect_label,
};
