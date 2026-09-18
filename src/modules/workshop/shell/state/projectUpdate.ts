/* The layout sub-barrel rather than the module barrel: the full barrel pulls
   the editor's components, whose imports circle back into workshop state. */
// eslint-disable-next-line no-restricted-imports -- the cycle the comment above names
import { findLeaf, type LayoutNode, leafHolding, leaves } from "@/modules/editor/layout";

import type { ShellArrangement, ShellKind } from "../../bin/shell/utils/shellPanes";
import { CLOSED_LIMIT, type ClosedDocument } from "./closedTabs";
import type { EditorRoot } from "./editorRoot";
import { dropStops, type NavigationStack, pushStop } from "./navigationStack";
import { withHeldLeaves, withoutPreviewDocument } from "./previewTabs";
import { EMPTY_EDITOR, type ProjectEditor } from "./projectEditor";
import { withoutShellLeaf } from "./shellMoves";

/**
 * What one action left behind: the editor, and what it did to the stack.
 *
 * The stack sits on the store root, so an action working inside one project's
 * slice cannot write it. It tags what it did instead, and `updateProject` folds
 * the tag into the shell's stack with the project the action was given.
 */
interface EditorMove {
  readonly editor: ProjectEditor;
  /** The document the action landed on, which the stack records. */
  readonly visited?: string;
  /** Documents that are gone, whose stops the stack drops. */
  readonly forgotten?: readonly string[];
  /** Tabs a close took, which the closed list holds for a reopen. */
  readonly closed?: readonly ClosedDocument[];
}

function asMove(target: ProjectEditor | EditorMove): EditorMove {
  return "editor" in target ? target : { editor: target };
}

/**
 * Apply a change to one project's editor, or report that nothing moved.
 *
 * Returning `null` lets the caller hand `set` the state object it was given.
 * Zustand compares by identity, so that is what makes an unchanged action skip
 * every subscriber rather than waking them with an equal value. An action that
 * only moved the stack still counts as a change, which is what records a route
 * onto the document a group is already showing.
 */
export function updateProject(
  state: EditorRoot,
  projectPath: string,
  change: (editor: ProjectEditor) => ProjectEditor | EditorMove | null,
): Partial<EditorRoot> | null {
  const current = state.byProject[projectPath] ?? EMPTY_EDITOR;
  const result = change(current);
  if (result === null) return null;

  const move = asMove(result);
  const editor = dropPrunedLeaves(move.editor);
  const stack = foldStack(state, projectPath, move);
  const closed = foldClosed(state, projectPath, move);
  const moved = editor !== current;
  if (!moved && stack === null && closed === null) return null;

  return {
    ...(moved ? { byProject: { ...state.byProject, [projectPath]: editor } } : null),
    ...stack,
    ...closed,
  };
}

/** The closed list with this action's tabs on top, or null for an action that closed none. */
function foldClosed(
  state: EditorRoot,
  project: string,
  move: EditorMove,
): Pick<EditorRoot, "closed"> | null {
  if (move.closed === undefined || move.closed.length === 0) return null;

  const closed = [...move.closed.map((tab) => ({ ...tab, project })), ...state.closed];
  return { closed: closed.slice(0, CLOSED_LIMIT) };
}

/**
 * The editor without the leaf ids its tree has lost: a maximized panel, a preview.
 *
 * Every close and every drop reaches a tree through {@link updateProject}, and
 * each of them prunes the leaf that gave up its last tab. A leaf id is minted
 * off the tree that holds it. An id kept past the prune names whichever leaf
 * takes the number next.
 */
function dropPrunedLeaves(editor: ProjectEditor): ProjectEditor {
  const maximizedLeafId =
    editor.maximizedLeafId !== null && !findLeaf(editor.layout, editor.maximizedLeafId)
      ? null
      : editor.maximizedLeafId;

  let maximizedShellLeaf = editor.maximizedShellLeaf;
  for (const [kind, leafId] of Object.entries(maximizedShellLeaf) as [ShellKind, string][]) {
    if (!findLeaf(editor.shells[kind].layout, leafId)) {
      maximizedShellLeaf = withoutShellLeaf(maximizedShellLeaf, kind);
    }
  }

  const previewIds = withHeldLeaves(editor.previewIds, editor.layout);

  if (
    maximizedLeafId === editor.maximizedLeafId &&
    maximizedShellLeaf === editor.maximizedShellLeaf &&
    previewIds === editor.previewIds
  ) {
    return editor;
  }
  return { ...editor, maximizedLeafId, maximizedShellLeaf, previewIds };
}

/* Forgotten before visited, so replacing a preview drops the tab it stood on
   and then records the one that took its place. */
function foldStack(
  stack: NavigationStack,
  project: string,
  move: EditorMove,
): NavigationStack | null {
  let next: NavigationStack | null = null;

  if (move.forgotten !== undefined) {
    const gone = new Set(move.forgotten);
    next = dropStops(
      stack,
      (entry) =>
        entry.kind === "document" && entry.project === project && gone.has(entry.documentId),
    );
  }

  if (move.visited !== undefined) {
    next = pushStop(next ?? stack, { kind: "document", project, documentId: move.visited }) ?? next;
  }

  return next;
}

/**
 * Tag the document a route just landed on, for the stack to record.
 *
 * Tagged inside the store actions rather than at their call sites, so a route
 * into a document cannot forget to report itself.
 */
export function recordVisit(target: ProjectEditor | EditorMove, documentId: string): EditorMove {
  return { ...asMove(target), visited: documentId };
}

/** Tag closed documents, so a back never lands on a tab that is gone. */
export function forgetVisits(
  target: ProjectEditor | EditorMove,
  documentIds: readonly string[],
): EditorMove {
  return { ...asMove(target), forgotten: documentIds };
}

/** Apply a change to one shell of one project's editor, or report that nothing moved. */
export function updateShell(
  state: EditorRoot,
  projectPath: string,
  kind: ShellKind,
  change: (shell: ShellArrangement) => ShellArrangement | null,
): Partial<EditorRoot> | null {
  return updateProject(state, projectPath, (editor) => {
    const next = change(editor.shells[kind]);
    return next === null ? null : { ...editor, shells: { ...editor.shells, [kind]: next } };
  });
}

/**
 * The editor a removal leaves behind, with what the tree dropped forgotten.
 *
 * `layout` is the tree after the removal and `removedIds` what it was asked to
 * drop. An id the tree still holds somewhere keeps its document, its dirty flag
 * and its pin.
 */
export function afterRemoval(
  editor: ProjectEditor,
  layout: LayoutNode,
  removedIds: readonly string[],
): EditorMove {
  const documents = { ...editor.documents };
  const dirty = new Set(editor.dirty);
  const closed: ClosedDocument[] = [];
  let pinned = editor.pinned;
  let previewIds = editor.previewIds;

  for (const id of removedIds) {
    if (leafHolding(layout, id)) continue;

    /* Read off the tree the removal was given rather than the one it left, so
       a reopen names the group the tab was closed from. */
    const from = leafHolding(editor.layout, id);
    const document = documents[id];
    if (from && document) {
      closed.push({ document, leafId: from.id, pinned: editor.pinned.includes(id) });
    }

    delete documents[id];
    dirty.delete(id);
    /* Rebuilt only for a document that held a pin, so a close of any other one
       leaves the persisted slice comparing equal. */
    if (pinned.includes(id)) pinned = pinned.filter((candidate) => candidate !== id);
    previewIds = withoutPreviewDocument(previewIds, id);
  }

  /* Closing a leaf's last tab prunes it, which can take the focused leaf with it. */
  const activeLeafId = findLeaf(layout, editor.activeLeafId)
    ? editor.activeLeafId
    : leaves(layout)[0].id;

  return {
    ...forgetVisits(
      { ...editor, documents, layout, activeLeafId, dirty, pinned, previewIds },
      removedIds,
    ),
    closed,
  };
}
