import type { BinRow } from "@/lib/tauri";

import type { EditorSet } from "./editorRoot";
import { updateProject } from "./projectUpdate";

/** Requests aimed at one open document, and the settles that drop an answered one. */
export interface DocumentAimActions {
  revealRow: (projectPath: string, documentId: string, key: string) => void;
  /** Drops the row request with `token`. A settled request reaches no later open. */
  settleRowReveal: (projectPath: string, token: number) => void;
  revealIgnoreLine: (projectPath: string, documentId: string, line: number) => void;
  /** Drops the line request with `token`. A settled request reaches no later open. */
  settleIgnoreLineReveal: (projectPath: string, token: number) => void;
  aimCurve: (projectPath: string, documentId: string, row: BinRow, chain: string) => void;
  /** Drops the curve request with `token`. A settled request reaches no later open. */
  settleCurveAim: (projectPath: string, token: number) => void;
  aimStringKey: (projectPath: string, documentId: string, key: string, line: string) => void;
  /** Drops the key request with `token`. A settled request reaches no later open. */
  settleStringKeyAim: (projectPath: string, token: number) => void;
}

/** These actions, closed over the writer of the store that holds them. */
export function createDocumentAimActions(set: EditorSet): DocumentAimActions {
  return {
    revealRow: (projectPath, documentId, key) =>
      set(
        (state) =>
          updateProject(state, projectPath, (editor) => ({
            ...editor,
            revealRow: {
              documentId,
              key,
              token: (editor.revealRow?.token ?? 0) + 1,
            },
          })) ?? state,
      ),

    settleRowReveal: (projectPath, token) =>
      set(
        (state) =>
          updateProject(state, projectPath, (editor) =>
            editor.revealRow?.token === token ? { ...editor, revealRow: null } : editor,
          ) ?? state,
      ),

    revealIgnoreLine: (projectPath, documentId, line) =>
      set(
        (state) =>
          updateProject(state, projectPath, (editor) => ({
            ...editor,
            revealIgnoreLine: {
              documentId,
              line,
              token: (editor.revealIgnoreLine?.token ?? 0) + 1,
            },
          })) ?? state,
      ),

    settleIgnoreLineReveal: (projectPath, token) =>
      set(
        (state) =>
          updateProject(state, projectPath, (editor) =>
            editor.revealIgnoreLine?.token === token
              ? { ...editor, revealIgnoreLine: null }
              : editor,
          ) ?? state,
      ),

    aimCurve: (projectPath, documentId, row, chain) =>
      set(
        (state) =>
          updateProject(state, projectPath, (editor) => ({
            ...editor,
            aimCurve: { documentId, row, chain, token: (editor.aimCurve?.token ?? 0) + 1 },
          })) ?? state,
      ),

    settleCurveAim: (projectPath, token) =>
      set(
        (state) =>
          updateProject(state, projectPath, (editor) =>
            editor.aimCurve?.token === token ? { ...editor, aimCurve: null } : editor,
          ) ?? state,
      ),

    aimStringKey: (projectPath, documentId, key, line) =>
      set(
        (state) =>
          updateProject(state, projectPath, (editor) => ({
            ...editor,
            aimStringKey: { documentId, key, line, token: (editor.aimStringKey?.token ?? 0) + 1 },
          })) ?? state,
      ),

    settleStringKeyAim: (projectPath, token) =>
      set(
        (state) =>
          updateProject(state, projectPath, (editor) =>
            editor.aimStringKey?.token === token ? { ...editor, aimStringKey: null } : editor,
          ) ?? state,
      ),
  };
}
