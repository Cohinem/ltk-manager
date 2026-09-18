import { type RefObject, useEffect, useRef } from "react";
import { create } from "zustand";

/** Reaching one document's own search box: focus it, with its text selected. */
export type DocumentFind = () => void;

interface DocumentFindStore {
  finds: Readonly<Record<string, DocumentFind>>;
  publish: (documentId: string, reveal: DocumentFind) => void;
  withdraw: (documentId: string) => void;
}

/*
 * Published by the mounted editor rather than declared by its registry entry,
 * the way a document's save is: the box a find reaches is an element only the
 * mounted component holds.
 *
 * Keyed by document id alone, because one project's editor is mounted at a time
 * and every one of its open documents stays mounted.
 */
const useDocumentFindStore = create<DocumentFindStore>()((set) => ({
  finds: {},
  publish: (documentId, reveal) =>
    set((state) => ({ finds: { ...state.finds, [documentId]: reveal } })),
  withdraw: (documentId) =>
    set((state) => {
      if (!(documentId in state.finds)) return state;

      const finds = { ...state.finds };
      delete finds[documentId];
      return { finds };
    }),
}));

/**
 * Offer this document's own find while it is mounted.
 *
 * `Ctrl+F` over the document runs `reveal` rather than falling back to the
 * palette. `reveal` is read at call time, so a fresh closure publishes once.
 */
export function useDocumentFind(documentId: string, reveal: DocumentFind): void {
  const current = useRef(reveal);
  useEffect(() => {
    current.current = reveal;
  });

  useEffect(() => {
    useDocumentFindStore.getState().publish(documentId, () => current.current());
    return () => useDocumentFindStore.getState().withdraw(documentId);
  }, [documentId]);
}

/**
 * Offer a toolbar box as this document's find, and hand back the ref it wants.
 *
 * `Ctrl+F` over the document focuses the box with its text selected.
 */
export function useFindBox(documentId: string): RefObject<HTMLInputElement | null> {
  const box = useRef<HTMLInputElement>(null);
  useDocumentFind(documentId, () => box.current?.select());
  return box;
}

/** The find `documentId` offers, or null for a document that offers none. */
export function documentFind(documentId: string): DocumentFind | null {
  return useDocumentFindStore.getState().finds[documentId] ?? null;
}
