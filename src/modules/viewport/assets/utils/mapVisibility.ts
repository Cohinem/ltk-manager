/**
 * The rule that selects which meshes and placeables of a map are drawn, per ADR-0064.
 *
 * If a mesh or a placeable references a visibility controller, it is drawn while that
 * controller is visible and its layer mask is ignored. The layer mask is used only when
 * no controller is referenced.
 */

import type { MapController, MapControllerRule, MapParentMode } from "@/lib/tauri";

/** The layer mask that the game treats as no layer restriction. */
const EVERY_LAYER = 0xff;

/** The active layer flags of a map and the state of each of its controllers under them. */
export interface MapVisibility {
  /** The active visibility flags, as a mask. */
  readonly flags: number;
  /** The state of each declared controller, keyed by path hash as `0x` and eight hex digits. */
  readonly controllers: ReadonlyMap<string, boolean>;
}

const NO_CONTROLLERS: ReadonlyMap<string, boolean> = new Map();

/** Controller states that replace the states computed from the rules, keyed by path hash. */
export type ControllerOverrides = ReadonlyMap<string, boolean>;

const NO_OVERRIDES: ControllerOverrides = new Map();

/** A visibility under `flags` with no controller states, so every layer mask is used. */
export function layerVisibility(flags: number): MapVisibility {
  return { flags, controllers: NO_CONTROLLERS };
}

/**
 * The state of each of `controllers` under the active `flags`.
 *
 * A controller in `overrides` takes the override state and its rule is not evaluated. A
 * child of that controller is computed from the override state. A parent that is not in
 * `controllers` counts as not visible. A controller that is its own ancestor is not
 * visible.
 */
export function mapVisibility(
  controllers: readonly MapController[],
  flags: number,
  overrides: ControllerOverrides = NO_OVERRIDES,
): MapVisibility {
  const rules = new Map(controllers.map((controller) => [controller.hash, controller.rule]));
  const states = new Map<string, boolean>();
  const open = new Set<string>();

  const visible = (hash: string): boolean => {
    const known = states.get(hash);
    if (known !== undefined) return known;

    const rule = rules.get(hash);
    if (rule === undefined || open.has(hash)) return false;

    open.add(hash);
    const state = overrides.get(hash) ?? ruleVisible(rule, flags, visible);
    open.delete(hash);

    states.set(hash, state);
    return state;
  };
  for (const controller of controllers) visible(controller.hash);

  return { flags, controllers: states };
}

function ruleVisible(
  rule: MapControllerRule,
  flags: number,
  visible: (hash: string) => boolean,
): boolean {
  switch (rule.kind) {
    /* In the game the server sets the state of a terrain controller. A backdrop has no
       server, so the active layer flags set it instead. */
    case "named":
      return rule.defaultVisible || (rule.terrain & flags) !== 0;
    case "child":
      return parentsVisible(rule.mode, rule.parents.filter(visible).length, rule.parents.length);
    case "layer":
      return (rule.mask & flags) !== 0;
    case "mutator":
    case "driven":
      return false;
  }
}

function parentsVisible(mode: MapParentMode, visible: number, parents: number): boolean {
  switch (mode) {
    case "all":
      return visible === parents;
    case "any":
      return visible > 0;
    case "one":
      return visible === 1;
    case "none":
      return visible === 0;
  }
}

/**
 * `overrides` changed so that the controller `hash` has the state `visible`.
 *
 * The override is removed if the rule of the controller already computes `visible` under
 * `flags` and the other overrides. The result then holds only the states that differ
 * from the computed ones.
 */
export function withControllerState(
  controllers: readonly MapController[],
  flags: number,
  overrides: ControllerOverrides,
  hash: string,
  visible: boolean,
): ControllerOverrides {
  const next = new Map(overrides);
  next.delete(hash);

  const computed = mapVisibility(controllers, flags, next).controllers.get(hash) ?? false;
  if (visible !== computed) next.set(hash, visible);

  return next;
}

/** Whether a layer `mask` is drawn under `flags` when no controller is referenced. */
export function layerVisible(mask: number, flags: number): boolean {
  return mask === EVERY_LAYER || (mask & flags) !== 0;
}

/**
 * Whether a mesh with the layer `mask` and the controller hash `controller` is drawn.
 *
 * If `visibility` has no state for `controller`, the mask is used. That is the case for
 * every controller until the map's model is loaded.
 */
export function meshVisible(
  visibility: MapVisibility,
  mask: number,
  controller: string | null,
): boolean {
  const state = controller === null ? undefined : visibility.controllers.get(controller);
  return state ?? layerVisible(mask, visibility.flags);
}

/**
 * Whether a placeable with the layer `mask` and the controller hash `controller` is drawn.
 *
 * If `visibility` has no state for `controller`, the placeable is not drawn. This keeps a
 * controlled placeable hidden until the map's model is loaded.
 */
export function placeableVisible(
  visibility: MapVisibility,
  mask: number,
  controller: string | null,
): boolean {
  if (controller === null) return layerVisible(mask, visibility.flags);
  return visibility.controllers.get(controller) === true;
}
