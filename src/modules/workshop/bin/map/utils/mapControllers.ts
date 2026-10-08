import { m } from "@/i18n";
import type { MapController, MapControllerRule } from "@/lib/tauri";

/** How many layers a mask holds, one bit each. */
const LAYER_COUNT = 8;

/** The 1-based numbers of the layers in `mask`, in bit order. */
export function layerNumbers(mask: number): number[] {
  const numbers: number[] = [];
  for (let index = 0; index < LAYER_COUNT; index += 1) {
    if ((mask & (1 << index)) !== 0) numbers.push(index + 1);
  }
  return numbers;
}

/** The display text of a controller: its name, or its path hash if it has no name. */
export function controllerLabel(controller: MapController): string {
  return controller.name ?? controller.hash;
}

/**
 * The title that the rule of a controller gives it: the layers of a terrain or of a layer
 * controller, the stage of a stage controller, or the name of a mutator.
 *
 * Null for a controller whose rule has no such value.
 */
export function ruleTitle(rule: MapControllerRule): string | null {
  switch (rule.kind) {
    case "named":
      if (rule.terrain !== 0) return layersLabel(rule.terrain);
      if (rule.stage !== 0) {
        return m.workshop_bin_preview_backdrop_controller_stage_label({
          number: layerNumbers(rule.stage).join(", "),
        });
      }
      return null;
    case "layer":
      return layersLabel(rule.mask);
    case "mutator":
      return rule.name;
    case "child":
    case "driven":
      return null;
  }
}

function layersLabel(mask: number): string {
  return m.workshop_bin_preview_backdrop_layer_label({ number: layerNumbers(mask).join(", ") });
}

/** The kinds that a list groups its independent controllers by, in listed order. */
export const CONTROLLER_GROUPS = ["terrain", "stage", "mutator", "other"] as const;

export type ControllerGroup = (typeof CONTROLLER_GROUPS)[number];

/** The display label of a controller group. */
export function groupLabel(group: ControllerGroup): string {
  switch (group) {
    case "terrain":
      return m.workshop_bin_preview_backdrop_controller_group_terrain_label();
    case "stage":
      return m.workshop_bin_preview_backdrop_controller_group_stage_label();
    case "mutator":
      return m.workshop_bin_preview_backdrop_controller_group_mutator_label();
    case "other":
      return m.workshop_bin_preview_backdrop_controller_group_other_label();
  }
}

/** How a dependent controller follows the controller it is listed under. */
export type ControllerRelation =
  /** The dependent is shown while the controller above it is shown. */
  | "with"
  /** The dependent is hidden while the controller above it is shown. */
  | "unless";

/** A child controller listed under one of its parents, with its own dependents. */
export interface ControllerDependent {
  readonly controller: MapController;
  readonly relation: ControllerRelation;
  readonly dependents: readonly ControllerDependent[];
}

/** An independent controller and the child controllers that depend on it. */
export interface ControllerEntry {
  readonly controller: MapController;
  readonly dependents: readonly ControllerDependent[];
}

/** The independent controllers of one group. */
export interface ControllerSection {
  readonly group: ControllerGroup;
  readonly entries: readonly ControllerEntry[];
}

/** The group of an independent controller, and the value that orders it in the group. */
function placement(rule: MapControllerRule): readonly [ControllerGroup, number] {
  if (rule.kind === "named" && rule.terrain !== 0) return ["terrain", rule.terrain];
  if (rule.kind === "named" && rule.stage !== 0) return ["stage", rule.stage];
  if (rule.kind === "mutator") return ["mutator", 0];
  return ["other", 0];
}

/**
 * `controllers` as the sections that a list shows.
 *
 * A controller that is not a child is an entry of its group: terrains by layer, stages by
 * stage, and the other groups in file order. A child controller is listed under each of
 * its parents, and under a parent that is itself a child. A child whose parents are all
 * missing from `controllers` is an entry of the last group, so every controller is
 * listed. A group with no entries has no section.
 */
export function controllerSections(controllers: readonly MapController[]): ControllerSection[] {
  const declared = new Set(controllers.map((controller) => controller.hash));

  const dependentsOf = (hash: string, above: ReadonlySet<string>): ControllerDependent[] =>
    controllers.flatMap((controller) => {
      const { rule } = controller;
      if (rule.kind !== "child" || !rule.parents.includes(hash)) return [];
      /* A controller that is its own ancestor is listed once and not again below itself. */
      if (controller.hash === hash || above.has(controller.hash)) return [];

      return [
        {
          controller,
          relation: rule.mode === "none" ? "unless" : "with",
          dependents: dependentsOf(controller.hash, new Set([...above, hash])),
        },
      ];
    });

  const independent = controllers.filter(
    ({ rule }) => rule.kind !== "child" || !rule.parents.some((parent) => declared.has(parent)),
  );

  return CONTROLLER_GROUPS.flatMap((group) => {
    const entries = independent
      .filter((controller) => placement(controller.rule)[0] === group)
      .sort((left, right) => placement(left.rule)[1] - placement(right.rule)[1])
      .map((controller) => ({
        controller,
        dependents: dependentsOf(controller.hash, new Set()),
      }));

    return entries.length === 0 ? [] : [{ group, entries }];
  });
}

/** The last segment of a material entry path. */
export function materialName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}
