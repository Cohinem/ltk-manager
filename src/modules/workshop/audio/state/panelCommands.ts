import { createContext, use, useEffect, useRef } from "react";

import type { AudioCommandId } from "../utils/keymap";

/** The panel of the audio file document that offers commands. */
export type AudioPanel = "media" | "events";

/** The commands that a panel runs for the document, each absent where it does not apply now. */
export type PanelCommands = Partial<Record<AudioCommandId, () => void>>;

/** What the document holds the commands of its panels in. */
export interface PanelCommandHub {
  readonly publish: (panel: AudioPanel, commands: PanelCommands) => void;
  readonly withdraw: (panel: AudioPanel) => void;
}

/** The hub of the enclosing audio file document, or null outside one. */
export const PanelCommandsContext = createContext<PanelCommandHub | null>(null);

/**
 * Offers `commands` of `panel` to the enclosing audio file document, for its document keys and its
 * palette commands, while the panel is mounted.
 *
 * The commands are read at the press, so a fresh closure on each render costs nothing.
 */
export function usePanelCommands(panel: AudioPanel, commands: PanelCommands): void {
  const hub = use(PanelCommandsContext);
  const latest = useRef(commands);
  latest.current = commands;

  const ids = Object.keys(commands)
    .filter((id) => commands[id as AudioCommandId] !== undefined)
    .sort()
    .join();
  useEffect(() => {
    if (hub === null) return;

    const offered: PanelCommands = {};
    for (const id of ids.split(",") as AudioCommandId[]) {
      if (id.length > 0) offered[id] = () => latest.current[id]?.();
    }
    hub.publish(panel, offered);
  }, [hub, panel, ids]);

  useEffect(() => {
    if (hub === null) return;

    return () => hub.withdraw(panel);
  }, [hub, panel]);
}
