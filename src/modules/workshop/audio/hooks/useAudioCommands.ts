import { type KeyboardEvent, useMemo, useRef, useState } from "react";

import { m } from "@/i18n";
import { type DocumentCommand, useDocumentCommands, useDocumentFind } from "@/modules/editor";
import { isOverlayOpen } from "@/utils";

import { COMMAND_LABELS } from "../components/AudioKeys";
import type { AudioPanel, PanelCommandHub, PanelCommands } from "../state/panelCommands";
import { type AudioCommandId, resolveCommand, shortcutOf, typesText } from "../utils/keymap";

/** The find key of a document that the editor does not name, which no `Ctrl+F` reaches. */
const NO_DOCUMENT = "audio:unnamed";

/** The commands of the palette, in the order that the palette lists them. */
const PALETTE_COMMANDS: readonly AudioCommandId[] = [
  "stop",
  "loop",
  "volumeDown",
  "volumeUp",
  "viewMedia",
  "viewEvents",
  "toggleVoices",
  "toggleInspector",
  "find",
  "add",
  "duplicate",
  "remove",
  "wrap",
  "cut",
  "paste",
  "copy",
  "save",
  "undo",
  "redo",
  "help",
];

/**
 * Returns the hub that the panels of a document offer their commands through, and the commands
 * that each panel offers now.
 */
export function usePanelHub() {
  const [panels, setPanels] = useState<Partial<Record<AudioPanel, PanelCommands>>>({});
  const hub = useMemo<PanelCommandHub>(
    () => ({
      publish: (panel, commands) => setPanels((current) => ({ ...current, [panel]: commands })),
      withdraw: (panel) =>
        setPanels((current) => {
          const next = { ...current };
          delete next[panel];
          return next;
        }),
    }),
    [],
  );

  return { hub, panels };
}

/**
 * Offers `commands` of the audio file document `documentId` to `Ctrl+F` and to the palette, and
 * returns the handler of the document keys.
 *
 * A key that a list, a knob or an entry answers stops there, so the handler reads a press from
 * outside them. A text field keeps every key. Per "Keys and gestures" in docs/ux/AUDIO.md.
 */
export function useAudioCommands(
  documentId: string | null,
  commands: PanelCommands,
): (event: KeyboardEvent<HTMLElement>) => void {
  const latest = useRef(commands);
  latest.current = commands;

  useDocumentFind(documentId ?? NO_DOCUMENT, () => latest.current.find?.());

  const ids = PALETTE_COMMANDS.filter((id) => commands[id] !== undefined).join();
  const offered = useMemo<readonly DocumentCommand[]>(
    () =>
      (ids.split(",") as AudioCommandId[])
        .filter((id) => id.length > 0)
        .map((id) => ({
          id: `audio.${id}`,
          title: COMMAND_LABELS[id](),
          group: m.audio_palette_group_label(),
          shortcut: shortcutOf(id) ?? undefined,
          run: () => latest.current[id]?.(),
        })),
    [ids],
  );
  useDocumentCommands(documentId, offered);

  return (event) => {
    if (typesText(event.target) || isOverlayOpen()) return;

    const command = resolveCommand(event, "document");
    const run = command === null ? undefined : commands[command];
    if (run === undefined) return;

    event.preventDefault();
    event.stopPropagation();
    run();
  };
}
