/* The layout sub-barrel rather than the module barrel: the full barrel pulls
   the editor's components, whose imports circle back into workshop state. */
// eslint-disable-next-line no-restricted-imports -- the cycle the comment above names
import {
  type DropOutcome,
  findLeaf,
  insertTab,
  leafHolding,
  removeTab,
  setActiveTab,
  setSplitLayout as applySplitLayout,
} from "@/modules/editor/layout";

import { type ShellKind, type ShellPaneId } from "../../bin/shell/utils/shellPanes";
import type { EditorSet } from "./editorRoot";
import { SHELL_ROOTS } from "./projectEditor";
import { updateProject, updateShell } from "./projectUpdate";
import { heldLeafId, shellDrop, withoutShellLeaf } from "./shellMoves";

/** What an object tab's shell does to its panes, which every tab of a kind draws in. */
export interface ShellPaneActions {
  /** Activates one of a pane leaf's own panes, and focuses that leaf. */
  activateShellPane: (
    projectPath: string,
    kind: ShellKind,
    leafId: string,
    paneId: ShellPaneId,
  ) => void;
  closeShellPane: (
    projectPath: string,
    kind: ShellKind,
    leafId: string,
    paneId: ShellPaneId,
  ) => void;
  /** Puts a closed pane back into the focused leaf, which is what the Panes menu asks for. */
  openShellPane: (projectPath: string, kind: ShellKind, paneId: ShellPaneId) => void;
  /** Commits one finished pane drag: a reorder, a move between leaves, or a split. */
  applyShellDrop: (projectPath: string, kind: ShellKind, outcome: DropOutcome) => void;
  setShellSplitLayout: (
    projectPath: string,
    kind: ShellKind,
    splitId: string,
    layout: Record<string, number>,
  ) => void;
  /** Puts every pane of one shell back where it ships. */
  resetShellLayout: (projectPath: string, kind: ShellKind) => void;
  /** Fills one shell with one pane, or gives its panes back. */
  toggleMaximizedShellLeaf: (projectPath: string, kind: ShellKind, leafId: string) => void;
  /** Gives one shell's panes back, which is what Esc asks for. */
  restoreMaximizedShellLeaf: (projectPath: string, kind: ShellKind) => void;
}

/** These actions, closed over the writer of the store that holds them. */
export function createShellPaneActions(set: EditorSet): ShellPaneActions {
  return {
    activateShellPane: (projectPath, kind, leafId, paneId) =>
      set(
        (state) =>
          updateShell(state, projectPath, kind, (shell) => {
            const layout = setActiveTab(shell.layout, leafId, paneId);
            if (layout === shell.layout && shell.leafId === leafId) return null;
            return { layout, leafId };
          }) ?? state,
      ),

    closeShellPane: (projectPath, kind, leafId, paneId) =>
      set(
        (state) =>
          updateShell(state, projectPath, kind, (shell) => {
            const layout = removeTab(shell.layout, leafId, paneId);
            if (layout === shell.layout) return null;
            return { layout, leafId: heldLeafId(layout, shell.leafId) };
          }) ?? state,
      ),

    openShellPane: (projectPath, kind, paneId) =>
      set(
        (state) =>
          updateShell(state, projectPath, kind, (shell) => {
            if (leafHolding(shell.layout, paneId)) return null;
            const leafId = heldLeafId(shell.layout, shell.leafId);
            return { layout: insertTab(shell.layout, leafId, paneId), leafId };
          }) ?? state,
      ),

    applyShellDrop: (projectPath, kind, outcome) =>
      set(
        (state) =>
          updateShell(state, projectPath, kind, (shell) => {
            const moved = shellDrop(shell.layout, outcome);
            if (moved.tree === shell.layout) return null;
            return { layout: moved.tree, leafId: moved.leafId };
          }) ?? state,
      ),

    setShellSplitLayout: (projectPath, kind, splitId, layout) =>
      set(
        (state) =>
          updateShell(state, projectPath, kind, (shell) => {
            const next = applySplitLayout(shell.layout, splitId, layout);
            return next === shell.layout ? null : { ...shell, layout: next };
          }) ?? state,
      ),

    resetShellLayout: (projectPath, kind) =>
      set(
        (state) =>
          updateProject(state, projectPath, (editor) => {
            const maximizedShellLeaf = withoutShellLeaf(editor.maximizedShellLeaf, kind);
            const arranged = editor.shells[kind].layout === SHELL_ROOTS[kind].layout;
            if (arranged && maximizedShellLeaf === editor.maximizedShellLeaf) return null;
            return {
              ...editor,
              shells: { ...editor.shells, [kind]: SHELL_ROOTS[kind] },
              maximizedShellLeaf,
            };
          }) ?? state,
      ),

    toggleMaximizedShellLeaf: (projectPath, kind, leafId) =>
      set(
        (state) =>
          updateProject(state, projectPath, (editor) => {
            if (editor.maximizedShellLeaf[kind] === leafId) {
              return {
                ...editor,
                maximizedShellLeaf: withoutShellLeaf(editor.maximizedShellLeaf, kind),
              };
            }
            if (!findLeaf(editor.shells[kind].layout, leafId)) return null;
            return {
              ...editor,
              maximizedShellLeaf: { ...editor.maximizedShellLeaf, [kind]: leafId },
            };
          }) ?? state,
      ),

    restoreMaximizedShellLeaf: (projectPath, kind) =>
      set(
        (state) =>
          updateProject(state, projectPath, (editor) => {
            const maximizedShellLeaf = withoutShellLeaf(editor.maximizedShellLeaf, kind);
            if (maximizedShellLeaf === editor.maximizedShellLeaf) return null;
            return { ...editor, maximizedShellLeaf };
          }) ?? state,
      ),
  };
}
