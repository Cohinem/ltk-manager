import type { View, ViewElement, ViewLook, ViewRect, ViewScene } from "../model/view";

/** A 1600 x 1200 rect anchored at the top left, the desktop HUD's frame. */
export function rect(
  x: number,
  y: number,
  w: number,
  h: number,
  overrides: Partial<ViewRect> = {},
): ViewRect {
  return {
    position: [x, y],
    size: [w, h],
    source: [1600, 1200],
    anchor: { kind: "single", anchor: [0, 0] },
    ignoreGlobalScale: false,
    ignoreSafeZone: false,
    disableResolutionDownscale: false,
    disablePixelSnapping: [false, false],
    minSize: [0, 0],
    maxSize: [1_000_000, 1_000_000],
    ...overrides,
  };
}

export function scene(key: string, layer: number, parent: string | null = null): ViewScene {
  return {
    key,
    path: null,
    label: key,
    class: "UISceneData",
    parent,
    layer,
    enabled: false,
    inheritScissoring: true,
  };
}

export function icon(texture = 0): ViewLook {
  return {
    kind: "icon",
    sprite: { texture, uv: [0, 0, 0.5, 0.5], name: null, slice: null },
    color: [255, 0, 0, 255],
    useAlpha: true,
    flip: [false, false],
    perPixelUvs: [false, false],
    fillType: 0,
    material: null,
  };
}

export function element(
  key: string,
  sceneKey: string | null,
  layer: number,
  look: ViewLook,
  position: ViewRect | null = rect(0, 0, 100, 100),
): ViewElement {
  return {
    key,
    path: null,
    label: key,
    class: "UiElementIconData",
    scene: sceneKey,
    layer,
    enabled: true,
    position: position === null ? null : { kind: "rect", rect: position },
    look,
  };
}

export function view(scenes: ViewScene[], elements: ViewElement[]): View {
  return {
    entry: "0x00000001",
    name: null,
    class: "TestViewController",
    folder: null,
    files: [],
    variant: null,
    scenes,
    elements,
    comboBoxes: [],
    textures: [{ path: "page", asset: null, page: true }],
    fonts: [],
    styleSheets: [],
    warnings: [],
  };
}
