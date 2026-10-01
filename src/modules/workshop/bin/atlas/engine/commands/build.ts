import { effectPasses, frameFraction } from "../effects/effects";
import {
  addQuad,
  addSlice,
  covered,
  emptyGeometry,
  flipped,
  type Geometry,
  type Rgba,
  type Uv,
} from "../geometry/quads";
import { edgeScale, type LayoutSettings, type PixelRect } from "../layout/solve";
import type { ClonedElement, PreviewOverlay } from "../model/combo";
import { type MeterCut, meterDraws } from "../model/meters";
import { type TooltipSample, withTooltip } from "../model/tooltip";
import {
  elementOf,
  originalOf,
  parentOf,
  placedKeys,
  sceneAncestry,
  sceneOf,
  type ViewTree,
} from "../model/tree";
import type { ViewElement, ViewLook, ViewSprite } from "../model/view";
import { restsHidden } from "../model/visibility";
import { textDraws } from "../text/draws";
import { sampleText } from "../text/samples";
import type { TextSource } from "../text/source";
import { hiddenOf, isHidden } from "./hidden";
import { sceneScissors } from "./scissors";
import type { Command, DrawCommand, ParticleCommand, TextCommand } from "./types";

/** What the preview shows that the file does not decide, per section 6 of the editor plan. */
export interface PreviewState {
  /** The scenes drawn off, `hiddenScenesOf`'s answer. A scene's descendants go with it. */
  readonly hiddenScenes: ReadonlySet<string>;
  /** The state each button draws by its key, the default state for one it does not hold. */
  readonly buttonStates: ReadonlyMap<string, string>;
  /** The fill each meter draws by its key, `meterFills`'s answer. */
  readonly meterFills: ReadonlyMap<string, number>;
  /** An effect or meter the file leaves off draws too, per `restsHidden` and `disabledMeters`. */
  readonly showDisabled: boolean;
  /** The elements the reader hid, each with everything a group of them holds. */
  readonly hiddenElements: ReadonlySet<string>;
  /** Every effect and particle element draws, per `isEffect`. */
  readonly effects: boolean;
  /** A text the controller fills at run time draws `sampleText`. */
  readonly samples: boolean;
  /** The elements drawn, every one where it is null. */
  readonly only: ReadonlySet<string> | null;
  /** What the preview draws over the file: its combo boxes' lists and labels. */
  readonly overlay: PreviewOverlay;
  /** The string the view's tooltip is laid out with while samples draw, none to leave it as the file places it. */
  readonly tooltip: TooltipSample | null;
}

export interface BuildInput {
  readonly tree: ViewTree;
  readonly solved: ReadonlyMap<string, PixelRect>;
  readonly settings: LayoutSettings;
  readonly preview: PreviewState;
  /** Each texture's size in pixels by its index in the view, once it has loaded. */
  readonly textureSizes: ReadonlyMap<number, readonly [number, number]>;
  /** The fonts and strings texts draw from, and none to draw no text. */
  readonly text: TextSource | null;
}

const WHITE: Rgba = [255, 255, 255, 255];
const FULL_UV: Uv = [0, 0, 1, 1];
const UNCUT: MeterCut["crop"] = [1, 1];
const FILL_COVER = 1;

/** A drawn element or an offscreen group, with what sorts it. */
interface Item {
  readonly key: string;
  readonly sort: readonly [number, number, number];
  readonly group: boolean;
  /** The row this item draws its element as, where it is an overlay's clone. */
  readonly clone?: ClonedElement;
}

/** How far after its original a copy or a clone sorts, which keeps it above the original. */
const CLONE_ORDER = 0.5;

/**
 * The frame's command list, per section 2.4 of docs/plans/atlas-renderer.md: every element of
 * a shown scene sorted by scene layer, element layer and file order, a group below full alpha
 * drawn offscreen between a push and a pop. A copy the controller makes draws as its original
 * does, at its own rect.
 */
export function buildCommands(raw: BuildInput): Command[] {
  const input = withOverlay(withLaidTooltip(raw));
  const { tree } = input;
  const { overlay } = input.preview;
  const shownScenes = shownScenesOf(tree, input.preview.hiddenScenes);
  const meters = meterDraws(tree, input.solved, input.preview.meterFills);
  const hidden = hiddenOf(tree, input.preview);
  for (const key of meters.hidden) hidden.add(key);
  const scissors = sceneScissors(tree, input.solved);

  const offscreenOwner = (key: string): string | null => {
    let at = parentOf(tree, key);
    while (at !== undefined) {
      if (isOffscreen(elementOf(tree, at))) return at;
      at = parentOf(tree, at);
    }
    return null;
  };

  const lists = new Map<string | null, Item[]>();
  const add = (owner: string | null, item: Item) => {
    const list = lists.get(owner);
    if (list === undefined) lists.set(owner, [item]);
    else list.push(item);
  };
  for (const key of placedKeys(tree)) {
    const original = originalOf(tree, key);
    const element = tree.elements.get(original);
    const scene = sceneOf(tree, key);
    if (element === undefined || scene === null || !shownScenes.has(scene)) continue;
    if (isHidden(tree, hidden, original) || overlay.hidden.has(original)) continue;
    if (!input.preview.showDisabled && restsHidden(element) && !overlay.shown.has(original)) {
      continue;
    }
    if (input.preview.only !== null && !input.preview.only.has(key)) continue;

    const offscreen = isOffscreen(element);
    if (element.look.kind === "group" && !offscreen) continue;

    const [sceneLayer, layer, order] = sortOf(tree, scene, element);
    add(offscreenOwner(key), {
      key,
      sort: [sceneLayer, layer, key === original ? order : order + CLONE_ORDER],
      group: offscreen,
    });
  }
  overlay.clones.forEach((clone, at) => {
    if (overlay.hidden.has(clone.element)) return;

    const element = tree.elements.get(clone.element);
    const scene = sceneOf(tree, clone.element);
    if (element === undefined || scene === null || !shownScenes.has(scene)) return;
    if (input.preview.only !== null && !input.preview.only.has(clone.element)) return;

    const [sceneLayer, layer, order] = sortOf(tree, scene, element);
    add(offscreenOwner(clone.element), {
      key: `${clone.element}#${at}`,
      sort: [sceneLayer, layer, order + CLONE_ORDER],
      group: false,
      clone,
    });
  });

  const commands: Command[] = [];
  const emit = (owner: string | null) => {
    const items = [...(lists.get(owner) ?? [])].sort(compareItems);
    for (const item of items) {
      const element = elementOf(tree, item.clone?.element ?? item.key);
      if (element === undefined) continue;

      const scissor = scissors.get(sceneOf(tree, element.key) ?? "") ?? null;
      if (item.clone !== undefined) {
        const text = item.clone.text ?? overlay.texts.get(element.key) ?? null;
        commands.push(...drawsOf(element, item.clone.rect, scissor, input, text));
        continue;
      }
      if (!item.group) {
        const cut = meters.cuts.get(item.key);
        const rect = cut?.rect ?? input.solved.get(item.key);
        const text = overlay.texts.get(element.key) ?? null;
        if (rect !== undefined) {
          commands.push(...drawsOf(element, rect, scissor, input, text, cut?.crop));
        }
        continue;
      }

      commands.push({ kind: "push", group: item.key });
      emit(item.key);
      commands.push({
        kind: "pop",
        group: item.key,
        alpha: element.look.kind === "group" ? element.look.alpha : 1,
        rect: input.solved.get(item.key) ?? fullScreen(input.settings),
        scissor,
      });
    }
  };
  emit(null);
  return commands;
}

/**
 * Every element the preview shows, groups included, in the command list's sort, so the last
 * one holding a point is the topmost there. A pick walks it from the end.
 */
export function visibleElements(tree: ViewTree, preview: PreviewState): string[] {
  const shownScenes = shownScenesOf(tree, preview.hiddenScenes);
  const hidden = hiddenOf(tree, preview);
  const { overlay } = preview;
  const items: Item[] = [];
  for (const element of tree.view.elements) {
    const scene = sceneOf(tree, element.key);
    if (scene === null || !shownScenes.has(scene) || isHidden(tree, hidden, element.key)) continue;
    if (overlay.hidden.has(element.key)) continue;
    if (!preview.showDisabled && restsHidden(element) && !overlay.shown.has(element.key)) {
      continue;
    }
    if (preview.only !== null && !preview.only.has(element.key)) continue;

    items.push({
      key: element.key,
      sort: sortOf(tree, scene, element),
      group: element.look.kind === "group",
    });
  }
  return items.sort(compareItems).map((item) => item.key);
}

/** An element's place in the draw order: its scene's layer, its own layer, its file order. */
function sortOf(tree: ViewTree, scene: string, element: ViewElement): [number, number, number] {
  return [tree.scenes.get(scene)?.layer ?? 0, element.layer, tree.fileOrder.get(element.key) ?? 0];
}

/** `input` with its view's tooltip laid out in its overlay while samples draw, per `withTooltip`. */
function withLaidTooltip(input: BuildInput): BuildInput {
  const { preview } = input;
  if (!preview.samples || preview.tooltip === null) return input;

  const overlay = withTooltip(preview.overlay, preview.tooltip, input);
  return overlay === preview.overlay ? input : { ...input, preview: { ...preview, overlay } };
}

/** `input` with the overlay's moved rects in place of the solver's. */
function withOverlay(input: BuildInput): BuildInput {
  const { moved } = input.preview.overlay;
  if (moved.size === 0) return input;

  const solved = new Map(input.solved);
  for (const [key, rect] of moved) solved.set(key, rect);
  return { ...input, solved };
}

function compareItems(a: Item, b: Item): number {
  return a.sort[0] - b.sort[0] || a.sort[1] - b.sort[1] || a.sort[2] - b.sort[2];
}

/** A group below full alpha, which the client draws offscreen and composites. */
function isOffscreen(element: ViewElement | undefined): boolean {
  return element?.look.kind === "group" && element.look.alpha < 1;
}

/** Every scene whose own and ancestors' toggles are on. */
function shownScenesOf(tree: ViewTree, hiddenScenes: ReadonlySet<string>): Set<string> {
  const shown = new Set<string>();
  for (const key of tree.scenes.keys()) {
    if (sceneAncestry(tree, key).every((scene) => !hiddenScenes.has(scene))) shown.add(key);
  }
  return shown;
}

function fullScreen(settings: LayoutSettings): PixelRect {
  return { x: 0, y: 0, w: settings.screen.width, h: settings.screen.height };
}

/**
 * The draws one element makes at `rect`, none for a look that draws nothing on the frame. A text
 * given `text` reads it in place of its own, and a sprite a meter cuts to `crop` samples that part
 * of itself where it samples per pixel along X.
 */
function drawsOf(
  element: ViewElement,
  rect: PixelRect,
  scissor: PixelRect | null,
  input: BuildInput,
  text: string | null,
  crop: MeterCut["crop"] = UNCUT,
): (DrawCommand | TextCommand | ParticleCommand)[] {
  if (rect.w <= 0 || rect.h <= 0) return [];

  const { look } = element;
  if (look.kind === "particle") return particleDraws(element, look, rect, scissor, input);
  if (look.kind === "icon") {
    return iconDraws(element, look, rect, scissor, input, look.perPixelUvs[0] ? crop : UNCUT);
  }
  if (look.kind === "effect") {
    return effectDraws(element.key, look, rect, scissor, input, look.perPixelUvsX ? crop : UNCUT);
  }
  if (look.kind === "text" && input.text !== null) {
    const { view } = input.tree;
    const sample = input.preview.samples
      ? sampleText(element.label, element.path, element.key)
      : null;
    return textDraws(
      element.key,
      text === null ? look : { ...look, traKey: "" },
      rect,
      scissor,
      view,
      input.text,
      input.settings.screen.height,
      text ?? sample,
    );
  }
  return [];
}

/** An element's particle system, drawn about the centre of its rect. */
function particleDraws(
  element: ViewElement,
  look: Extract<ViewLook, { kind: "particle" }>,
  rect: PixelRect,
  scissor: PixelRect | null,
  input: BuildInput,
): ParticleCommand[] {
  if (look.system === null) return [];

  const position = element.position?.kind === "fullScreen" ? null : element.position?.rect;
  const hud = position?.ignoreGlobalScale === true ? 1 : input.settings.hud;
  const { screen } = input.settings;
  const source: readonly [number, number] =
    position !== undefined && position !== null && position.source[0] > 0 && position.source[1] > 0
      ? [position.source[0], position.source[1]]
      : [screen.width, screen.height];

  return [
    {
      kind: "particles",
      system: look.system,
      origin: [rect.x + rect.w / 2, rect.y + rect.h / 2],
      scale: (look.scale ?? 1) * hud,
      source,
      scissor,
      element: element.key,
    },
  ];
}

function iconDraws(
  element: ViewElement,
  look: Extract<ViewLook, { kind: "icon" }>,
  rect: PixelRect,
  scissor: PixelRect | null,
  input: BuildInput,
  crop: MeterCut["crop"],
): DrawCommand[] {
  const { sprite } = look;
  if (sprite === null) return [];

  const size = input.textureSizes.get(sprite.texture) ?? null;
  const geometry = emptyGeometry();
  const sliced =
    sprite.slice !== null &&
    addSlice(
      geometry,
      rect,
      sprite.uv,
      sprite.slice,
      look.flip,
      look.color,
      input.settings.screen,
      size,
      edgeScale(element, input.settings),
    );
  if (!sliced) {
    const uv = croppedUv(flipped(sprite.uv, look.flip), crop);
    addQuad(
      geometry,
      rect,
      look.fillType === FILL_COVER ? covered(uv, rect, size) : uv,
      look.color,
      input.settings.screen,
    );
  }

  return [
    {
      kind: "draw",
      shader: look.useAlpha ? "blend" : "opaque",
      texture: sprite.texture,
      geometry,
      primitive: "triangles",
      blend: look.useAlpha ? "premultiplied" : "opaque",
      effect: null,
      material: look.material,
      scissor,
      element: element.key,
    },
  ];
}

function effectDraws(
  key: string,
  look: Extract<ViewLook, { kind: "effect" }>,
  rect: PixelRect,
  scissor: PixelRect | null,
  input: BuildInput,
  crop: MeterCut["crop"],
): DrawCommand[] {
  const { effect, sprite } = look;
  const { screen } = input.settings;
  const color: Rgba = effect.effect === "instanced" ? effect.color : WHITE;
  const centre = [
    (rect.x + rect.w / 2) / screen.width,
    (rect.y + rect.h / 2) / screen.height,
  ] as const;

  const material = effect.effect === "customMaterial" ? effect.material : null;
  return effectPasses(effect, sprite !== null).flatMap((pass, index): DrawCommand[] => {
    if (pass.spriteUv && sprite === null) return [];

    const geometry = emptyGeometry();
    const uv =
      pass.spriteUv && sprite !== null
        ? croppedUv(effectUv(sprite, effect, look.flip), crop)
        : FULL_UV;
    if (pass.primitive === "lineStrip") addHand(geometry, rect, color, input.settings);
    else addQuad(geometry, rect, uv, color, screen);

    return [
      {
        kind: "draw",
        shader: pass.shader,
        texture: pass.spriteUv ? (sprite?.texture ?? null) : null,
        geometry,
        primitive: pass.primitive,
        blend: pass.shader === "ammoLine" ? "replace" : "premultiplied",
        material,
        effect: {
          effect,
          pass: index,
          centre,
          uvSize:
            sprite === null ? [1, 1] : [sprite.uv[2] - sprite.uv[0], sprite.uv[3] - sprite.uv[1]],
          texel: texelOf(sprite === null ? undefined : input.textureSizes.get(sprite.texture)),
        },
        scissor,
        element: key,
      },
    ];
  });
}

/** `uv` cut to a meter's crop: `u0' = u1 - (u1-u0)L` and `u1' = u0 + (u1-u0)R`. */
function croppedUv(uv: Uv, [left, right]: MeterCut["crop"]): Uv {
  const [u0, v0, u1, v1] = uv;
  return [u1 - (u1 - u0) * left, v0, u0 + (u1 - u0) * right, v1];
}

/** One texel of a texture of `size` in UV, and zero for one that has not loaded. */
function texelOf(size: readonly [number, number] | undefined): readonly [number, number] {
  if (size === undefined || size[0] <= 0 || size[1] <= 0) return [0, 0];
  return [1 / size[0], 1 / size[1]];
}

/** The sprite's UV for an effect, cut to the part a fill mask samples. */
function effectUv(
  sprite: ViewSprite,
  effect: Extract<ViewLook, { kind: "effect" }>["effect"],
  flip: readonly [boolean, boolean],
): Uv {
  const [u0, v0, u1, v1] = sprite.uv;
  const [fu, fv] = frameFraction(effect);
  return flipped([u0, v0, u0 + (u1 - u0) * fu, v0 + (v1 - v0) * fv], flip);
}

/**
 * A cooldown hand: a line from the top centre to the centre, then out along `angleParams`. The
 * last vertex carries the half extent in its coordinate, which the program scales by the angle.
 */
function addHand(geometry: Geometry, rect: PixelRect, color: Rgba, settings: LayoutSettings): void {
  const { width, height } = settings.screen;
  const cx = (rect.x + rect.w / 2) / width;
  const cy = (rect.y + rect.h / 2) / height;
  const points = [
    [cx, rect.y / height, 0, 0],
    [cx, cy, 0, 0],
    [cx, cy, rect.w / 2 / width, rect.h / 2 / height],
  ] as const;

  for (const [x, y, u, v] of points) {
    geometry.positions.push(x, y);
    geometry.colors.push(color[2], color[1], color[0], color[3]);
    geometry.texcoords.push(u, v, 0, 0);
  }
  geometry.indices.push(0, 1, 2);
}
