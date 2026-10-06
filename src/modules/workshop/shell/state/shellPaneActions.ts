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
import { setProject, setShell } from "./projectUpdate";
import { heldLeafId, shellDrop, withoutFloatingPane, withoutShellLeaf } from "./shellMoves";

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
  /**
   * Puts a closed or floating pane back into the focused leaf, which is what the Panes menu
   * asks for, and brings an open one to the front of its leaf.
   */
  openShellPane: (projectPath: string, kind: ShellKind, paneId: ShellPaneId) => void;
  /**
   * Takes a pane out of the tree into a floating frame over the shell, in front of the
   * others. A pane already floating comes to the front.
   */
  floatShellPane: (projectPath: string, kind: ShellKind, paneId: ShellPaneId) => void;
  /** Closes a floating pane. */
  closeFloatingShellPane: (projectPath: string, kind: ShellKind, paneId: ShellPaneId) => void;
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
      setShell(set, projectPath, kind, (shell) => {
        const layout = setActiveTab(shell.layout, leafId, paneId);
        if (layout === shell.layout && shell.leafId === leafId) return null;
        return { layout, leafId };
      }),

    closeShellPane: (projectPath, kind, leafId, paneId) =>
      setShell(set, projectPath, kind, (shell) => {
        const layout = removeTab(shell.layout, leafId, paneId);
        if (layout === shell.layout) return null;
        return { layout, leafId: heldLeafId(layout, shell.leafId) };
      }),

    openShellPane: (projectPath, kind, paneId) =>
      setProject(set, projectPath, (editor) => {
        const shell = editor.shells[kind];
        const floatingShellPanes = withoutFloatingPane(editor.floatingShellPanes, kind, paneId);
        const holder = leafHolding(shell.layout, paneId);
        const leafId = holder?.id ?? heldLeafId(shell.layout, shell.leafId);
        const layout =
          holder === null
            ? insertTab(shell.layout, leafId, paneId)
            : setActiveTab(shell.layout, leafId, paneId);
        if (layout === shell.layout && floatingShellPanes === editor.floatingShellPanes) {
          return null;
        }

        return {
          ...editor,
          shells: { ...editor.shells, [kind]: { layout, leafId } },
          floatingShellPanes,
        };
      }),

    floatShellPane: (projectPath, kind, paneId) =>
      setProject(set, projectPath, (editor) => {
        const shell = editor.shells[kind];
        const floating = editor.floatingShellPanes[kind] ?? [];
        const holder = leafHolding(shell.layout, paneId);
        if (holder === null && floating.at(-1) === paneId) return null;

        const layout = holder === null ? shell.layout : removeTab(shell.layout, holder.id, paneId);
        return {
          ...editor,
          shells: {
            ...editor.shells,
            [kind]: { layout, leafId: heldLeafId(layout, shell.leafId) },
          },
          floatingShellPanes: {
            ...editor.floatingShellPanes,
            [kind]: [...floating.filter((each) => each !== paneId), paneId],
          },
        };
      }),

    closeFloatingShellPane: (projectPath, kind, paneId) =>
      setProject(set, projectPath, (editor) => {
        const floatingShellPanes = withoutFloatingPane(editor.floatingShellPanes, kind, paneId);
        if (floatingShellPanes === editor.floatingShellPanes) return null;
        return { ...editor, floatingShellPanes };
      }),

    applyShellDrop: (projectPath, kind, outcome) =>
      setShell(set, projectPath, kind, (shell) => {
        const moved = shellDrop(shell.layout, outcome);
        if (moved.tree === shell.layout) return null;
        return { layout: moved.tree, leafId: moved.leafId };
      }),

    setShellSplitLayout: (projectPath, kind, splitId, layout) =>
      setShell(set, projectPath, kind, (shell) => {
        const next = applySplitLayout(shell.layout, splitId, layout);
        return next === shell.layout ? null : { ...shell, layout: next };
      }),

    resetShellLayout: (projectPath, kind) =>
      setProject(set, projectPath, (editor) => {
        const maximizedShellLeaf = withoutShellLeaf(editor.maximizedShellLeaf, kind);
        const arranged = editor.shells[kind].layout === SHELL_ROOTS[kind].layout;
        const floats = (editor.floatingShellPanes[kind] ?? []).length > 0;
        if (arranged && !floats && maximizedShellLeaf === editor.maximizedShellLeaf) return null;
        return {
          ...editor,
          shells: { ...editor.shells, [kind]: SHELL_ROOTS[kind] },
          maximizedShellLeaf,
          floatingShellPanes: floats
            ? { ...editor.floatingShellPanes, [kind]: [] }
            : editor.floatingShellPanes,
        };
      }),

    toggleMaximizedShellLeaf: (projectPath, kind, leafId) =>
      setProject(set, projectPath, (editor) => {
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
      }),

    restoreMaximizedShellLeaf: (projectPath, kind) =>
      setProject(set, projectPath, (editor) => {
        const maximizedShellLeaf = withoutShellLeaf(editor.maximizedShellLeaf, kind);
        if (maximizedShellLeaf === editor.maximizedShellLeaf) return null;
        return { ...editor, maximizedShellLeaf };
      }),
  };
}
