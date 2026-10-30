import type { ReactNode } from "react";
import { useEffect } from "react";
import { create } from "zustand";

/** One action that a mounted document offers to the command palette. */
export interface DocumentCommand {
  readonly id: string;
  readonly title: string;
  readonly group: string;
  readonly keywords?: readonly string[];
  readonly shortcut?: string;
  readonly enabled?: boolean;
  readonly disabledReason?: string;
  readonly icon?: ReactNode;
  readonly run: () => void;
}

const NO_COMMANDS: readonly DocumentCommand[] = [];

interface DocumentCommandStore {
  commands: Readonly<Record<string, readonly DocumentCommand[]>>;
}

/*
 * Published by the mounted editor, as a document's find is, because the actions close over the
 * state of the mounted component. Keyed by document id alone, because one project's editor is
 * mounted at a time.
 */
const useDocumentCommandStore = create<DocumentCommandStore>()(() => ({ commands: {} }));

/**
 * Offers `commands` to the palette while the document `documentId` is mounted.
 *
 * The caller memoizes `commands`, and each new list replaces the one before it.
 */
export function useDocumentCommands(
  documentId: string | null,
  commands: readonly DocumentCommand[],
): void {
  useEffect(() => {
    if (documentId === null) return;

    useDocumentCommandStore.setState((state) => ({
      commands: { ...state.commands, [documentId]: commands },
    }));
  }, [documentId, commands]);

  useEffect(() => {
    if (documentId === null) return;

    return () =>
      useDocumentCommandStore.setState((state) => {
        const commands = { ...state.commands };
        delete commands[documentId];
        return { commands };
      });
  }, [documentId]);
}

/** Returns the commands that the document `documentId` offers, and none for a null id. */
export function useOfferedCommands(documentId: string | null): readonly DocumentCommand[] {
  return useDocumentCommandStore((state) =>
    documentId === null ? NO_COMMANDS : (state.commands[documentId] ?? NO_COMMANDS),
  );
}
