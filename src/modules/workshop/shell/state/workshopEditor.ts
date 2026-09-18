import { create } from "zustand";

import { createDocumentActions, type DocumentActions } from "./documentActions";
import { createDocumentAimActions, type DocumentAimActions } from "./documentAimActions";
import type { EditorRoot } from "./editorRoot";
import { createGroupActions, type GroupActions } from "./groupActions";
import { createHistoryActions, type HistoryActions } from "./historyActions";
import { createLayerActions, type LayerActions } from "./layerActions";
import { createProjectActions, type ProjectActions } from "./projectActions";
import { createShellPaneActions, type ShellPaneActions } from "./shellPaneActions";

/* The store's own surface is what every caller outside this directory reads, so
   the shapes it is built out of carry through it rather than asking a reader to
   know which module holds which. */
export type { ClosedTab } from "./closedTabs";
export type {
  CurveAimRequest,
  IgnoreLineRevealRequest,
  RevealRequest,
  RowRevealRequest,
  StringKeyAimRequest,
} from "./editorRequests";
export type { EditorRoot } from "./editorRoot";
export type { ExplorerStop, HistoryEntry } from "./navigationStack";
export type { PreviewIds } from "./previewTabs";
export { EMPTY_EDITOR, NO_COLLAPSED_DIRS, type ProjectEditor } from "./projectEditor";

/**
 * Everything the workshop's editors hold, and everything they answer.
 *
 * The state is {@link EditorRoot} and the actions are one group per subject,
 * each in a module beside this one. A group closes over the writer it is handed
 * rather than reaching for the store, so what a group touches is what its own
 * signature names.
 */
interface WorkshopEditorStore
  extends
    EditorRoot,
    DocumentActions,
    GroupActions,
    ShellPaneActions,
    HistoryActions,
    LayerActions,
    DocumentAimActions,
    ProjectActions {}

export const useWorkshopEditorStore = create<WorkshopEditorStore>()((set, get) => ({
  byProject: {},
  history: [],
  historyIndex: -1,
  closed: [],
  pendingDocuments: {},

  ...createDocumentActions(set, get),
  ...createGroupActions(set),
  ...createShellPaneActions(set),
  ...createHistoryActions(set, get),
  ...createLayerActions(set),
  ...createDocumentAimActions(set),
  ...createProjectActions(set),
}));

/**
 * Every document holding unsaved edits, across the projects the shell has open.
 *
 * The dirty set is memory-only and an editor reports its own, so this names
 * what is mounted now. What a quit asks about.
 */
export function unsavedDocumentIds(): readonly string[] {
  const { byProject } = useWorkshopEditorStore.getState();
  return Object.values(byProject).flatMap((editor) => [...editor.dirty]);
}
