import { useEffect, useRef } from "react";
import { create } from "zustand";

/**
 * Writing one document's unsaved edits.
 *
 * Resolves once the write landed, and rejects with whatever stopped it.
 */
export type DocumentSave = () => Promise<unknown>;

/** What one mounted editor offers, and when it would have written on its own. */
interface DocumentSaver {
  write: DocumentSave;
  /** This document holds its edits until something asks, rather than autosaving. */
  onDemand: boolean;
}

interface DocumentSaveStore {
  savers: Readonly<Record<string, DocumentSaver>>;
  publish: (documentId: string, saver: DocumentSaver) => void;
  withdraw: (documentId: string) => void;
}

/*
 * Published by the mounted editor rather than declared by its registry entry,
 * the way a document's toolbar is: what a save writes is the buffer the editor
 * holds, which only the mounted component can reach.
 *
 * Keyed by document id alone, because one project's editor is mounted at a time
 * and every one of its open documents stays mounted.
 */
const useDocumentSaveStore = create<DocumentSaveStore>()((set) => ({
  savers: {},
  publish: (documentId, saver) =>
    set((state) => ({ savers: { ...state.savers, [documentId]: saver } })),
  withdraw: (documentId) =>
    set((state) => {
      if (!(documentId in state.savers)) return state;

      const savers = { ...state.savers };
      delete savers[documentId];
      return { savers };
    }),
}));

/** Publish while mounted. `write` is read at call time, so a fresh closure publishes once. */
function useSaver(documentId: string, write: DocumentSave, onDemand: boolean): void {
  const current = useRef(write);
  useEffect(() => {
    current.current = write;
  });

  useEffect(() => {
    const saver = { write: () => current.current(), onDemand };
    useDocumentSaveStore.getState().publish(documentId, saver);
    return () => useDocumentSaveStore.getState().withdraw(documentId);
  }, [documentId, onDemand]);
}

/**
 * Offer this document's save while it is mounted, for a document that holds its edits.
 *
 * The close question offers a Save for one of these, and a quit asks about it.
 */
export function useDocumentSave(documentId: string, save: DocumentSave): void {
  useSaver(documentId, save, true);
}

/**
 * Offer this document's pending write while it is mounted, for a document that autosaves.
 *
 * A quit writes these rather than asking about them, so a debounce that has not
 * fired reaches the file.
 */
export function useDocumentFlush(documentId: string, flush: DocumentSave): void {
  useSaver(documentId, flush, false);
}

/** Whether `documentId` holds its edits until something asks it to write. */
export function useSavesOnDemand(documentId: string | null): boolean {
  return useDocumentSaveStore(
    (s) => documentId !== null && s.savers[documentId]?.onDemand === true,
  );
}

/** The save `documentId` offers, or null for a document that offers none. */
export function documentSave(documentId: string): DocumentSave | null {
  return useDocumentSaveStore.getState().savers[documentId]?.write ?? null;
}

/** Which of `documentIds` no mounted editor can write, so a caller cannot save them. */
export function unwritableDocumentIds(documentIds: Iterable<string>): readonly string[] {
  const { savers } = useDocumentSaveStore.getState();
  return [...documentIds].filter((id) => savers[id] === undefined);
}

/** Write every named document that offers a save. Rejects with the first failure. */
export function saveDocuments(documentIds: Iterable<string>): Promise<void> {
  const { savers } = useDocumentSaveStore.getState();
  const writing = [...documentIds].flatMap((id) => {
    const saver = savers[id];
    return saver ? [saver.write()] : [];
  });
  return Promise.all(writing).then(() => undefined);
}

/**
 * Write every autosaving document, and wait for all of them.
 *
 * A document that holds its edits until it is asked is left alone, so a quit
 * that is cancelled has written nothing the author did not ask for.
 */
export function flushDocumentSaves(): Promise<void> {
  const savers = Object.values(useDocumentSaveStore.getState().savers);
  const writing = savers.filter((saver) => !saver.onDemand).map((saver) => saver.write());
  return Promise.allSettled(writing).then(() => undefined);
}
