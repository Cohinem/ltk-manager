import type { Alignment } from "../engine/edit/arrange";
import type { LayerStep } from "../engine/edit/targets";

/** The ids of the commands that the canvas and the panes offer the menu bar of an Atlas tab. */
export const ATLAS_COMMANDS = {
  fit: "atlas.fit",
  actual: "atlas.actual",
  zoomIn: "atlas.zoomIn",
  zoomOut: "atlas.zoomOut",
  frame: "atlas.frame",
  nudgeLeft: "atlas.nudgeLeft",
  nudgeRight: "atlas.nudgeRight",
  nudgeUp: "atlas.nudgeUp",
  nudgeDown: "atlas.nudgeDown",
  delete: "atlas.delete",
  selectAll: "atlas.selectAll",
  selectGroup: "atlas.selectGroup",
  selectLayer: "atlas.selectLayer",
  copyName: "atlas.copyName",
  copyPath: "atlas.copyPath",
  openObject: "atlas.openObject",
  openBeside: "atlas.openBeside",
  spriteExport: "atlas.spriteExport",
  spriteReplace: "atlas.spriteReplace",
  hideElement: "atlas.hideElement",
  hideScene: "atlas.hideScene",
  sceneFrames: "atlas.sceneFrames",
  moveScene: "atlas.moveScene",
  distributeHorizontal: "atlas.distributeHorizontal",
  distributeVertical: "atlas.distributeVertical",
} as const;

/** The id of the draw order step `step`. */
export function arrangeCommand(step: LayerStep): string {
  return `atlas.arrange.${step}`;
}

/** The id of the alignment `how`. */
export function alignCommand(how: Alignment): string {
  return `atlas.align.${how}`;
}

/**
 * The id of the row at `at` of a list command such as `ATLAS_COMMANDS.moveScene`.
 *
 * The command's own id carries the reason that the list holds no row.
 */
export function listedCommand(list: string, at: number): string {
  return `${list}.${at}`;
}

/** The id of the command that focuses the sample field of a font preview. */
export const FONT_FOCUS_SAMPLE_COMMAND = "font.focusSample";
