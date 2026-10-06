import { classAlias } from "./classNames";

/** The heading a kind is listed under in the components pane. */
export type KindCategory = "basic" | "group" | "control" | "effect";

/** The headings in the order the components pane lists them. */
export const KIND_CATEGORIES: readonly KindCategory[] = ["basic", "group", "control", "effect"];

/** One kind of element an author adds to a view. */
export interface ElementKind {
  /** The meta class a new element of the kind is an object of. */
  readonly class: string;
  /** The English word its object name ends in, never the translated alias. */
  readonly name: string;
  readonly category: KindCategory;
  /** The size it starts at in source pixels, and null for a class that holds no `Position`. */
  readonly size: readonly [number, number] | null;
}

const SQUARE = [128, 128] as const;

function effect(className: string, name: string): ElementKind {
  return { class: className, name, category: "effect", size: SQUARE };
}

/** Every kind the components pane offers, in the order it lists them. */
export const ELEMENT_KINDS: readonly ElementKind[] = [
  { class: "UiElementIconData", name: "Image", category: "basic", size: SQUARE },
  { class: "UiElementTextData", name: "Text", category: "basic", size: [240, 40] },
  { class: "UiElementRegionData", name: "Region", category: "basic", size: SQUARE },
  { class: "UiElementScissorRegionData", name: "ClipRegion", category: "basic", size: [240, 160] },
  { class: "UiElementParticleSystemData", name: "Particles", category: "basic", size: SQUARE },
  { class: "UiElementGroupData", name: "Group", category: "group", size: null },
  { class: "UiElementGroupManagedLayoutData", name: "AutoLayout", category: "group", size: null },
  { class: "UiElementGroupFramedData", name: "FramedGroup", category: "group", size: null },
  { class: "UiElementGroupButtonData", name: "Button", category: "control", size: null },
  { class: "UiElementGroupSliderData", name: "Slider", category: "control", size: null },
  { class: "UiElementGroupMeterData", name: "Meter", category: "control", size: null },
  effect("UiElementEffectAnimationData", "Flipbook"),
  effect("UiElementEffectCooldownData", "Cooldown"),
  effect("UiElementEffectCooldownRadialData", "CooldownSweep"),
  effect("UiElementEffectCircleMaskCooldownData", "RoundCooldown"),
  effect("UiElementEffectAmmoData", "Ammo"),
  effect("UiElementEffectFillPercentageData", "Fill"),
  effect("UiElementEffectArcFillData", "ArcFill"),
  effect("UiElementEffectGlowData", "Glow"),
  effect("UiElementEffectLineData", "Line"),
  effect("UiElementEffectDesaturateData", "Desaturate"),
  effect("UiElementEffectCircleMaskDesaturateData", "RoundDesaturate"),
  effect("UiElementEffectInstancedData", "Instanced"),
  effect("UiElementEffectRotatingIconData", "RotatingImage"),
  effect("UiElementEffectAnimatedRotatingIconData", "AnimatedRotatingImage"),
  effect("UiElementEffectGlowingRotatingIconData", "GlowingRotatingImage"),
];

/** The kind whose elements are objects of the class `className`, if the pane offers one. */
export function kindOf(className: string): ElementKind | undefined {
  return ELEMENT_KINDS.find((kind) => kind.class === className);
}

/** The kinds whose alias, name or class holds `query`, ignoring case, and all for a blank one. */
export function matchingKinds(query: string): readonly ElementKind[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return ELEMENT_KINDS;

  return ELEMENT_KINDS.filter((kind) =>
    [classAlias(kind.class), kind.name, kind.class].some((word) =>
      word.toLowerCase().includes(needle),
    ),
  );
}
