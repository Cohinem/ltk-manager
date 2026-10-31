import { m, readOnlyDescription } from "@/i18n";
import type { CommandMenuCommand, CommandMenuEntry } from "@/modules/editor";

import type { MapSceneState } from "../state/mapScene";

/** The class of a glyph in a menu item. */
export const MENU_ICON = "size-4";

/** Returns why the scene takes no edits, and undefined if it takes them. */
export function editReason(scene: MapSceneState): string | undefined {
  if (scene.editable) return undefined;
  if (scene.readOnly !== null) return readOnlyDescription(scene.readOnly);
  if (scene.located && !scene.hasMaterials) return m.workshop_bin_menu_map_no_materials_reason();

  return m.workshop_bin_menu_map_opening_reason();
}

/** Returns a command that shows `readOnly` if the map takes no edits, and `reason` otherwise. */
export function editCommand(
  command: Omit<CommandMenuCommand, "kind" | "reason">,
  readOnly: string | undefined,
  reason: string,
): CommandMenuEntry {
  return { kind: "command", ...command, reason: readOnly ?? reason };
}
