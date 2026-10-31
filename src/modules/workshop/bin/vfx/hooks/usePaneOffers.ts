import { use } from "react";

import { useContentVisible } from "@/hooks";
import { readOnlyDescription } from "@/i18n";

import { ObjectMenuContext } from "../../menus/state/objectMenu";
import {
  type PaneCommands,
  type PaneFocusProps,
  usePaneCommands,
} from "../../menus/state/paneCommands";

const NO_COMMANDS: PaneCommands = {};

/** Offers `commands` of `source` to the menu bar while the pane is on screen, and none otherwise. */
export function useShownPaneCommands(source: string, commands: PaneCommands): PaneFocusProps {
  const visible = useContentVisible();

  return usePaneCommands(source, visible ? commands : NO_COMMANDS);
}

/** Returns why the enclosing object tab takes no edit, or undefined if it takes edits. */
export function useReadOnlyReason(): string | undefined {
  const readOnly = use(ObjectMenuContext)?.readOnly ?? null;

  return readOnly === null ? undefined : readOnlyDescription(readOnly);
}
