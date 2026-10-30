import { createContext, use, useEffect, useRef } from "react";

import type { AudioCommandId } from "../utils/keymap";

/** The panel of the audio file document that offers commands. */
export type AudioPanel = "media" | "events";

/** The commands that a panel runs for the document, each absent where it does not apply now. */
export type PanelCommands = Partial<Record<AudioCommandId, () => void>>;

/** What the document holds the commands of its panels in, by panel and part. */
export interface PanelCommandHub {
  readonly publish: (source: string, commands: PanelCommands) => void;
  readonly withdraw: (source: string) => void;
}

/** The hub of the enclosing audio file document, or null outside one. */
export const PanelCommandsContext = createContext<PanelCommandHub | null>(null);

/** Returns the key that the commands of `part` of `panel` are held under. */
export function panelSource(panel: AudioPanel, part: string): string {
  return `${panel}:${part}`;
}

/** Returns the commands that every part of `panel` offers, merged, from `published`. */
export function commandsOfPanel(
  published: Readonly<Record<string, PanelCommands>>,
  panel: AudioPanel,
): PanelCommands {
  const prefix = panelSource(panel, "");

  return Object.entries(published)
    .filter(([source]) => source.startsWith(prefix))
    .reduce<PanelCommands>((merged, [, commands]) => ({ ...merged, ...commands }), {});
}

/**
 * Offers `commands` of `part` of `panel` to the enclosing audio file document, for its document
 * keys, its menu bar and its palette commands, while the part is mounted.
 *
 * The commands are read at the press, so a fresh closure on each render costs nothing. A panel
 * whose list offers commands of its own publishes them as a second part.
 */
export function usePanelCommands(
  panel: AudioPanel,
  commands: PanelCommands,
  part: string = "panel",
): void {
  const hub = use(PanelCommandsContext);
  const latest = useRef(commands);
  latest.current = commands;
  const source = panelSource(panel, part);

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
    hub.publish(source, offered);
  }, [hub, source, ids]);

  useEffect(() => {
    if (hub === null) return;

    return () => hub.withdraw(source);
  }, [hub, source]);
}
