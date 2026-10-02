import { useCallback, useEffect, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";

import type { WorkshopProject } from "@/lib/tauri";
import { findLeaf, type LayoutNode, leaves } from "@/modules/editor";
import { usePreviewOnClick } from "@/stores/workshopLayout";

import type { SelectedModule } from "../../bin/documents/state/editorFile";
import {
  isShellPaneId,
  openShellPanes,
  type ShellKind,
  type ShellPaneId,
} from "../../bin/shell/utils/shellPanes";
import {
  type ContentDocument,
  documentLayerName,
  inSandbox,
} from "../../documents/utils/contentDocument";
import type { OpenIntent } from "../../palette/utils/types";
import { useProjectContext } from "../../projects/state/ProjectContext";
import { useRouteSandbox, useSandbox } from "../../sandbox/state/SandboxContext";
import {
  type CurveAimRequest,
  EMPTY_EDITOR,
  type HistoryEntry,
  type IgnoreLineRevealRequest,
  NO_COLLAPSED_DIRS,
  type ProjectEditor,
  type RowRevealRequest,
  type RevealRequest,
  type StringKeyAimRequest,
  useWorkshopEditorStore,
} from "../state/workshopEditor";

/**
 * The editor state of the project the caller is mounted inside.
 *
 * Every hook here resolves its project from the surrounding `ProjectProvider`,
 * so a panel reads what it needs without being handed a path. Where a panel
 * hangs - either side panel, the document surface, a cell of a future grid -
 * then has no bearing on how it reaches state, which is what lets a panel move
 * without its call sites changing.
 */
function useProjectPath(): string {
  return useProjectContext().path;
}

type EditorStore = ReturnType<typeof useWorkshopEditorStore.getState>;

/** A store action that takes the project path first. */
type ProjectActionKey = {
  [K in keyof EditorStore]: EditorStore[K] extends (
    projectPath: string,
    ...rest: never[]
  ) => unknown
    ? K
    : never;
}[keyof EditorStore];

/** A store action that takes the project path and one more leading argument. */
type LeadActionKey<L> = {
  [K in keyof EditorStore]: EditorStore[K] extends (
    projectPath: string,
    lead: L,
    ...rest: never[]
  ) => unknown
    ? K
    : never;
}[keyof EditorStore];

type WithoutPath<F> = F extends (projectPath: string, ...rest: infer R) => infer T
  ? (...rest: R) => T
  : never;

type WithoutLead<F> = F extends (projectPath: string, lead: never, ...rest: infer R) => infer T
  ? (...rest: R) => T
  : never;

type AnyAction = (...args: unknown[]) => unknown;

type DocumentRequestKey = "revealRow" | "revealIgnoreLine" | "aimCurve" | "aimStringKey";

/** The request `key` the project holds for document `documentId`, until the document settles it. */
function useDocumentRequest<K extends DocumentRequestKey>(
  key: K,
  documentId: string,
): ProjectEditor[K] | null {
  const projectPath = useProjectPath();
  return useWorkshopEditorStore((s) => {
    const request = (s.byProject[projectPath] ?? EMPTY_EDITOR)[key];
    if (!request || request.documentId !== documentId) return null;
    return request;
  });
}

/** Store action `key`, bound to the caller's project. */
function useProjectAction<K extends ProjectActionKey>(key: K): WithoutPath<EditorStore[K]> {
  const projectPath = useProjectPath();
  const action = useWorkshopEditorStore((s) => s[key]) as AnyAction;

  return useCallback(
    (...rest: unknown[]) => action(projectPath, ...rest),
    [action, projectPath],
  ) as WithoutPath<EditorStore[K]>;
}

/** Store action `key`, bound to the caller's project and to `lead`, such as a shell's kind. */
function useLeadAction<L, K extends LeadActionKey<L>>(
  key: K,
  lead: L,
): WithoutLead<EditorStore[K]> {
  const projectPath = useProjectPath();
  const action = useWorkshopEditorStore((s) => s[key]) as AnyAction;

  return useCallback(
    (...rest: unknown[]) => action(projectPath, lead, ...rest),
    [action, projectPath, lead],
  ) as WithoutLead<EditorStore[K]>;
}

export function useLayoutTree(): LayoutNode {
  const projectPath = useProjectPath();
  return useWorkshopEditorStore((s) => (s.byProject[projectPath] ?? EMPTY_EDITOR).layout);
}

export function useActiveLeafId(): string {
  const projectPath = useProjectPath();
  return useWorkshopEditorStore((s) => (s.byProject[projectPath] ?? EMPTY_EDITOR).activeLeafId);
}

/** One leaf's tabs resolved to documents, in strip order. */
export function useLeafTabs(leafId: string): readonly ContentDocument[] {
  const projectPath = useProjectPath();
  return useWorkshopEditorStore(
    useShallow((s) => {
      const editor = s.byProject[projectPath] ?? EMPTY_EDITOR;
      const leaf = findLeaf(editor.layout, leafId);
      return (leaf?.tabs ?? []).flatMap((id) => {
        const document = editor.documents[id];
        return document ? [document] : [];
      });
    }),
  );
}

export function useLeafActiveId(leafId: string): string | null {
  const projectPath = useProjectPath();
  return useWorkshopEditorStore((s) => {
    const editor = s.byProject[projectPath] ?? EMPTY_EDITOR;
    return findLeaf(editor.layout, leafId)?.activeTab ?? null;
  });
}

/** Every open document, in depth-first reading order across the leaves. */
export function useOpenDocuments(): readonly ContentDocument[] {
  const projectPath = useProjectPath();
  return useWorkshopEditorStore(
    useShallow((s) => {
      const editor = s.byProject[projectPath] ?? EMPTY_EDITOR;
      return leaves(editor.layout)
        .flatMap((leaf) => leaf.tabs)
        .flatMap((id) => {
          const document = editor.documents[id];
          return document ? [document] : [];
        });
    }),
  );
}

/** The active tab of the focused leaf, which is what the sidebar highlights. */
export function useActiveDocumentId(): string | null {
  const projectPath = useProjectPath();
  return useWorkshopEditorStore((s) => {
    const editor = s.byProject[projectPath] ?? EMPTY_EDITOR;
    return findLeaf(editor.layout, editor.activeLeafId)?.activeTab ?? null;
  });
}

/** One group's ephemeral tab, which draws in italic and that group's next open replaces. */
export function usePreviewDocumentId(leafId: string): string | null {
  const projectPath = useProjectPath();
  return useWorkshopEditorStore(
    (s) => (s.byProject[projectPath] ?? EMPTY_EDITOR).previewIds[leafId] ?? null,
  );
}

export function useDirtyDocumentIds(): ReadonlySet<string> {
  const projectPath = useProjectPath();
  return useWorkshopEditorStore((s) => (s.byProject[projectPath] ?? EMPTY_EDITOR).dirty);
}

/** The documents a user pinned, which lead their strip. */
export function usePinnedDocumentIds(): readonly string[] {
  const projectPath = useProjectPath();
  return useWorkshopEditorStore((s) => (s.byProject[projectPath] ?? EMPTY_EDITOR).pinned);
}

export function useSetDocumentPinned() {
  return useProjectAction("setDocumentPinned");
}

/**
 * The layer that every layer-scoped panel reads.
 *
 * Falls back to the first layer when the project has chosen none yet, and when
 * the chosen one is gone, which is what a delete of the selected layer leaves
 * behind.
 */
export function useSelectedLayerName(): string | null {
  const project = useProjectContext();
  const selected = useWorkshopEditorStore(
    (s) => (s.byProject[project.path] ?? EMPTY_EDITOR).selectedLayer,
  );

  const layers = project.layers;
  return useMemo(() => {
    if (selected && layers.some((layer) => layer.name === selected)) return selected;
    return layers[0]?.name ?? null;
  }, [layers, selected]);
}

export function useCollapsedDirs(layerName: string): ReadonlySet<string> {
  const projectPath = useProjectPath();
  return useWorkshopEditorStore(
    (s) => (s.byProject[projectPath] ?? EMPTY_EDITOR).collapsed[layerName] ?? NO_COLLAPSED_DIRS,
  );
}

/**
 * The pending reveal for one layer's tree, or null when another layer was asked.
 *
 * Returning null for a tree nobody addressed also keeps it from re-rendering on
 * a request meant for its neighbour.
 */
export function useRevealRequest(layerName: string): RevealRequest | null {
  const projectPath = useProjectPath();
  return useWorkshopEditorStore((s) => {
    const request = (s.byProject[projectPath] ?? EMPTY_EDITOR).reveal;
    if (!request || request.layerName !== layerName) return null;
    return request;
  });
}

/** Open the document another surface asked for, once the editor can hold it. */
export function useRequestedDocument(projectPath: string, ready: boolean) {
  useEffect(() => {
    if (!ready) return;

    const store = useWorkshopEditorStore.getState();
    const document = store.takePendingDocument(projectPath);
    if (document) store.openDocument(projectPath, document);
  }, [projectPath, ready]);
}

/**
 * The document to open from inside another document: a game chunk with no sandbox of its
 * own gets the enclosing document's sandbox, so a link keeps its sandbox (ADR-0056). A layer
 * file always opens in its project.
 */
function useOpenedInSandbox(): (document: ContentDocument) => ContentDocument {
  const sandbox = useSandbox();
  const route = useRouteSandbox();
  return useCallback(
    (document: ContentDocument) => {
      if (document.kind !== "preview" && document.kind !== "object") return document;
      if (document.sandbox !== undefined || document.asset.kind !== "gameChunk") return document;

      return inSandbox(document, sandbox, route);
    },
    [sandbox, route],
  );
}

export function useOpenDocument() {
  const projectPath = useProjectPath();
  const opened = useOpenedInSandbox();
  return useCallback(
    (requested: ContentDocument) => {
      const document = opened(requested);
      const store = useWorkshopEditorStore.getState();
      store.openDocument(projectPath, document);

      const layerName = documentLayerName(document);
      if (layerName) store.selectLayer(projectPath, layerName);
    },
    [projectPath, opened],
  );
}

/**
 * Opens a document as the ephemeral tab, in place of whichever one holds that
 * role.
 *
 * What a single click on a row calls while the preview setting is on.
 * {@link useOpenDocumentTab} picks between this and a permanent open.
 */
export function useOpenPreview() {
  const projectPath = useProjectPath();
  const opened = useOpenedInSandbox();
  return useCallback(
    (requested: ContentDocument) => {
      const document = opened(requested);
      const store = useWorkshopEditorStore.getState();
      store.openPreview(projectPath, document);

      const layerName = documentLayerName(document);
      if (layerName) store.selectLayer(projectPath, layerName);
    },
    [projectPath, opened],
  );
}

/**
 * Opens a document the way the user asked a click to open one.
 *
 * The replaceable tab while the setting is on, and a tab of its own while it is
 * off. Either way a document that is already open activates where it sits
 * rather than opening twice.
 */
export function useOpenDocumentTab() {
  const previewOnClick = usePreviewOnClick();
  const openPreview = useOpenPreview();
  const openDocument = useOpenDocument();
  return useCallback(
    (document: ContentDocument) => {
      if (previewOnClick) openPreview(document);
      else openDocument(document);
    },
    [previewOnClick, openPreview, openDocument],
  );
}

/**
 * What a single click on a tree row opens: the replaceable tab, or nothing.
 *
 * A click that opens nothing is a click that selects the row alone, which is
 * what the setting off asks for. A double click opens through
 * {@link useOpenDocument} either way, which keeps whatever the click previewed.
 *
 * Per "How a file opens" in `docs/ux/PROJECT_EDITOR.md`.
 */
export function useOpenRowPreview() {
  const previewOnClick = usePreviewOnClick();
  const openPreview = useOpenPreview();
  return useCallback(
    (document: ContentDocument) => {
      if (previewOnClick) openPreview(document);
    },
    [previewOnClick, openPreview],
  );
}

/**
 * Opens into a fresh group beside the focused one.
 *
 * What `Ctrl+Enter` on a palette row asks for, and what a future Open to the
 * Side wires up.
 */
export function useOpenDocumentBeside() {
  const projectPath = useProjectPath();
  const openDocumentBeside = useWorkshopEditorStore((s) => s.openDocumentBeside);
  const opened = useOpenedInSandbox();
  return useCallback(
    (requested: ContentDocument) => {
      const document = opened(requested);
      openDocumentBeside(projectPath, document);

      const layerName = documentLayerName(document);
      if (layerName) useWorkshopEditorStore.getState().selectLayer(projectPath, layerName);
    },
    [openDocumentBeside, projectPath, opened],
  );
}

/**
 * Opens a document the way an intent asks: the tab mode, beside the focused group,
 * or as a pinned tab.
 *
 * What `Enter` and its modifiers on a palette row ask for, and what a click and a
 * `Ctrl+click` on a row's action or a link chip ask for.
 */
export function useOpenDocumentAs() {
  const openTab = useOpenDocumentTab();
  const openDocument = useOpenDocument();
  const openBeside = useOpenDocumentBeside();
  return useCallback(
    (document: ContentDocument, intent: OpenIntent) => {
      if (intent === "beside") openBeside(document);
      else if (intent === "permanent") openDocument(document);
      else openTab(document);
    },
    [openBeside, openDocument, openTab],
  );
}

/** The intent a click carries: beside with `Ctrl` or `Cmd` held, the tab mode without. */
export function clickIntent(event: { ctrlKey: boolean; metaKey: boolean }): OpenIntent {
  return event.ctrlKey || event.metaKey ? "beside" : "default";
}

/** The open document `id`, or null where it is not open. */
export function useEditorDocument(id: string): ContentDocument | null {
  const projectPath = useProjectPath();
  return useWorkshopEditorStore((s) => s.byProject[projectPath]?.documents[id] ?? null);
}

/** Put a document in the tab another holds, keeping its place, as a sandbox switch does. */
export function useReplaceDocument() {
  return useProjectAction("replaceDocument");
}

export function usePromoteDocument() {
  return useProjectAction("promoteDocument");
}

export function useActivateDocument() {
  const projectPath = useProjectPath();
  return useCallback(
    (leafId: string, id: string) => {
      const store = useWorkshopEditorStore.getState();
      store.activateDocument(projectPath, leafId, id);

      /* The panels follow the strip while the tree is still a document. Once it
         is a panel of its own, selection is the sidebar's alone and this goes. */
      const document = store.byProject[projectPath]?.documents[id] ?? null;
      const layerName = documentLayerName(document);
      if (layerName) store.selectLayer(projectPath, layerName);
    },
    [projectPath],
  );
}

export function useCloseDocument() {
  return useProjectAction("closeDocument");
}

/** Close every document a layer owns, which is what a delete of that layer asks for. */
export function useCloseLayerDocuments() {
  return useProjectAction("closeLayerDocuments");
}

/**
 * Update the editor after the layer `from` is renamed to `displayName`. The new layer name is
 * read from `updated`. The layer's tabs keep their place under the new name, and
 * `.ltk/editor.json` saves them.
 */
export function useFollowLayerRename() {
  const projectPath = useProjectPath();
  const renameLayer = useWorkshopEditorStore((s) => s.renameLayer);
  return useCallback(
    (from: string, displayName: string, updated: WorkshopProject) => {
      const to = updated.layers.find((layer) => layer.displayName === displayName)?.name;
      if (to !== undefined) renameLayer(projectPath, from, to);
    },
    [renameLayer, projectPath],
  );
}

/** Whether a reopen has anything to put back, which the key and the command read. */
export function useHasClosedDocuments(): boolean {
  const projectPath = useProjectPath();
  return useWorkshopEditorStore((s) => s.closed.some((tab) => tab.project === projectPath));
}

/**
 * Puts the newest tab this project closed back, permanent and pinned as it was.
 *
 * What `Ctrl+Shift+T` and the palette's own row ask for. A press with nothing
 * closed does nothing.
 */
export function useReopenClosedDocument() {
  const projectPath = useProjectPath();
  return useCallback(() => {
    const store = useWorkshopEditorStore.getState();
    const document = store.reopenClosedDocument(projectPath);

    const layerName = documentLayerName(document);
    if (layerName) store.selectLayer(projectPath, layerName);
  }, [projectPath]);
}

export function useReorderDocuments() {
  return useProjectAction("reorderDocuments");
}

export function useMoveDocument() {
  const projectPath = useProjectPath();
  const moveDocument = useWorkshopEditorStore((s) => s.moveDocument);
  return useCallback(
    (documentId: string, toLeafId: string, index?: number) =>
      moveDocument(projectPath, documentId, toLeafId, index),
    [moveDocument, projectPath],
  );
}

export function useSplitWithDocument() {
  return useProjectAction("splitWithDocument");
}

export function useFocusLeaf() {
  const projectPath = useProjectPath();
  return useCallback(
    (leafId: string) => {
      const store = useWorkshopEditorStore.getState();
      store.focusLeaf(projectPath, leafId);

      /* Focus follows the layer of whatever the leaf shows, the same way an
         activate does, so the side panels track the surface being worked in. */
      const editor = store.byProject[projectPath];
      const activeTab = editor ? findLeaf(editor.layout, leafId)?.activeTab : null;
      const document = activeTab ? (editor?.documents[activeTab] ?? null) : null;
      const layerName = documentLayerName(document);
      if (layerName) store.selectLayer(projectPath, layerName);
    },
    [projectPath],
  );
}

export function useSetSplitLayout() {
  const projectPath = useProjectPath();
  const setSplitLayout = useWorkshopEditorStore((s) => s.setSplitLayout);
  return useCallback(
    (splitId: string, layout: Record<string, number>) =>
      setSplitLayout(projectPath, splitId, layout),
    [setSplitLayout, projectPath],
  );
}

export function useResetLayout() {
  return useProjectAction("resetLayout");
}

/** One group holds itself against an open that did not name it. */
export function useLeafLocked(leafId: string): boolean {
  const projectPath = useProjectPath();
  return useWorkshopEditorStore((s) => {
    const editor = s.byProject[projectPath] ?? EMPTY_EDITOR;
    return findLeaf(editor.layout, leafId)?.locked === true;
  });
}

export function useSetLeafLocked() {
  return useProjectAction("setLeafLocked");
}

/**
 * The panel filling the grid, or null while the tree draws whole.
 *
 * Null for a leaf the tree has lost, which is what a prune leaves behind.
 */
export function useMaximizedLeafId(): string | null {
  const projectPath = useProjectPath();
  return useWorkshopEditorStore((s) => {
    const editor = s.byProject[projectPath] ?? EMPTY_EDITOR;
    if (editor.maximizedLeafId === null) return null;
    return findLeaf(editor.layout, editor.maximizedLeafId) ? editor.maximizedLeafId : null;
  });
}

/** Fill the grid with one panel, or give the tree back. */
export function useToggleMaximizedLeaf() {
  return useProjectAction("toggleMaximizedLeaf");
}

/** Give the tree back, which is what Esc asks for. */
export function useRestoreMaximizedLeaf() {
  return useProjectAction("restoreMaximizedLeaf");
}

export function useSetDocumentDirty() {
  return useProjectAction("setDocumentDirty");
}

export function useSelectLayer() {
  return useProjectAction("selectLayer");
}

/** The project's "Use game data declarations" choice, undefined where it made none. */
export function useUseDeclarationsChoice(projectPath: string | undefined): boolean | undefined {
  return useWorkshopEditorStore((s) =>
    projectPath === undefined ? undefined : s.byProject[projectPath]?.useDeclarations,
  );
}

export function useSetUseDeclarations() {
  return useProjectAction("setUseDeclarations");
}

const NO_HIDDEN_LAYERS: readonly string[] = [];

/** The layers whose declarations a declared document leaves unmarked, none outside a project. */
export function useHiddenMarkLayers(projectPath: string | undefined): readonly string[] {
  return useWorkshopEditorStore((s) =>
    projectPath === undefined
      ? NO_HIDDEN_LAYERS
      : (s.byProject[projectPath]?.hiddenMarkLayers ?? NO_HIDDEN_LAYERS),
  );
}

export function useSetMarkLayerShown() {
  return useProjectAction("setMarkLayerShown");
}

/** The module a declared document's new keys join, null for the default placement. ADR-0048. */
export function useSelectedModule(): SelectedModule | null {
  const projectPath = useProjectPath();
  return useWorkshopEditorStore((s) => (s.byProject[projectPath] ?? EMPTY_EDITOR).selectedModule);
}

export function useSelectModule() {
  return useProjectAction("selectModule");
}

export function useToggleCollapsed(layerName: string) {
  return useLeadAction("toggleCollapsed", layerName);
}

/** Collapse every directory in `paths` of one layer's tree. */
export function useCollapseLayerDirs() {
  return useProjectAction("collapseDirs");
}

/** Open every directory in `paths` that the user had shut, for a reveal. */
export function useOpenLayerDirs() {
  return useProjectAction("openDirs");
}

export function useRevealInTree() {
  return useProjectAction("reveal");
}

/**
 * The pending row request aimed at `documentId`, or null.
 *
 * Null for a tab nobody addressed. A request meant for another tab re-renders no other
 * bin.
 */
export function useRowRevealRequest(documentId: string): RowRevealRequest | null {
  return useDocumentRequest("revealRow", documentId);
}

/** Drop the row request with `token`. The tab it addressed has answered it. */
export function useSettleRowReveal() {
  return useProjectAction("settleRowReveal");
}

/** Ask the open tab `documentId` to expand down to the row `key` and scroll to it. */
export function useRevealRow() {
  return useProjectAction("revealRow");
}

/** The pending line request aimed at `documentId`, or null for a tab nobody aimed. */
export function useIgnoreLineRevealRequest(documentId: string): IgnoreLineRevealRequest | null {
  return useDocumentRequest("revealIgnoreLine", documentId);
}

/** Ask the open rules document `documentId` to sit on `line`. */
export function useRevealIgnoreLine() {
  return useProjectAction("revealIgnoreLine");
}

/** Drop the line request with `token`. The document it addressed has answered it. */
export function useSettleIgnoreLineReveal() {
  return useProjectAction("settleIgnoreLineReveal");
}

/** The pending curve request aimed at `documentId`, or null for a tab nobody aimed. */
export function useCurveAimRequest(documentId: string): CurveAimRequest | null {
  return useDocumentRequest("aimCurve", documentId);
}

/** Drop the curve request with `token`. The tab it addressed has answered it. */
export function useSettleCurveAim() {
  return useProjectAction("settleCurveAim");
}

/** The pending key request aimed at `documentId`, or null for a document nobody aimed. */
export function useStringKeyAimRequest(documentId: string): StringKeyAimRequest | null {
  return useDocumentRequest("aimStringKey", documentId);
}

/** Drop the key request with `token`. The document it addressed has answered it. */
export function useSettleStringKeyAim() {
  return useProjectAction("settleStringKeyAim");
}

/** Ask the strings document `documentId` to take up `key`, whose in-game text is `line`. */
export function useAimStringKey() {
  return useProjectAction("aimStringKey");
}

/** Ask the object tab `documentId` to open its dock on `row`, captioned `chain`. */
export function useAimCurve() {
  return useProjectAction("aimCurve");
}

/**
 * Visited document ids, nearest first, each one once.
 *
 * Where the user stands leads, then where they came from, then where a forward
 * arrow would take them. This is both the order an empty palette lists its
 * documents in and the depth its history bonus decays over.
 */
export function useRecentDocumentIds(): readonly string[] {
  const projectPath = useProjectPath();
  return useWorkshopEditorStore(
    useShallow((s) => {
      const seen = new Set<string>();

      /* One project's stops out of a stack that spans the shell, or another
         project's document ids would rank this project's rows. */
      const take = (entry: HistoryEntry | undefined) => {
        if (entry?.kind === "document" && entry.project === projectPath) seen.add(entry.documentId);
      };

      for (let at = s.historyIndex; at >= 0; at -= 1) take(s.history[at]);
      for (let at = s.historyIndex + 1; at < s.history.length; at += 1) take(s.history[at]);
      return [...seen];
    }),
  );
}

/** Moves this project's editor to the path a rename gave it. */
export function useMoveProjectDocuments() {
  return useProjectAction("moveProject");
}

/** The split tree of one shell's panes, which every object tab of that kind draws in. */
export function useShellLayout(kind: ShellKind): LayoutNode {
  const projectPath = useProjectPath();
  return useWorkshopEditorStore(
    (s) => (s.byProject[projectPath] ?? EMPTY_EDITOR).shells[kind].layout,
  );
}

/** Which panes one pane leaf holds, in strip order. */
export function useShellPanes(kind: ShellKind, leafId: string): readonly ShellPaneId[] {
  const projectPath = useProjectPath();
  return useWorkshopEditorStore(
    useShallow((s) => {
      const editor = s.byProject[projectPath] ?? EMPTY_EDITOR;
      return (findLeaf(editor.shells[kind].layout, leafId)?.tabs ?? []).filter(isShellPaneId);
    }),
  );
}

export function useShellActivePane(kind: ShellKind, leafId: string): ShellPaneId | null {
  const projectPath = useProjectPath();
  return useWorkshopEditorStore((s) => {
    const editor = s.byProject[projectPath] ?? EMPTY_EDITOR;
    const active = findLeaf(editor.shells[kind].layout, leafId)?.activeTab;
    return isShellPaneId(active) ? active : null;
  });
}

/** Every pane the tree holds, which is what the Panes menu ticks. */
export function useOpenShellPanes(kind: ShellKind): ReadonlySet<ShellPaneId> {
  const projectPath = useProjectPath();
  return useWorkshopEditorStore(
    useShallow((s) =>
      openShellPanes((s.byProject[projectPath] ?? EMPTY_EDITOR).shells[kind].layout),
    ),
  );
}

export function useActivateShellPane(kind: ShellKind) {
  return useLeadAction("activateShellPane", kind);
}

export function useCloseShellPane(kind: ShellKind) {
  return useLeadAction("closeShellPane", kind);
}

export function useOpenShellPane(kind: ShellKind) {
  return useLeadAction("openShellPane", kind);
}

export function useApplyShellDrop(kind: ShellKind) {
  return useLeadAction("applyShellDrop", kind);
}

export function useSetShellSplitLayout(kind: ShellKind) {
  const projectPath = useProjectPath();
  const setShellSplitLayout = useWorkshopEditorStore((s) => s.setShellSplitLayout);
  return useCallback(
    (splitId: string, layout: Record<string, number>) =>
      setShellSplitLayout(projectPath, kind, splitId, layout),
    [setShellSplitLayout, projectPath, kind],
  );
}

export function useResetShellLayout(kind: ShellKind) {
  return useLeadAction("resetShellLayout", kind);
}

/**
 * The pane filling one shell, or null while its tree draws whole.
 *
 * Null for a leaf the tree has lost, which is what a prune leaves behind.
 */
export function useShellMaximizedLeaf(kind: ShellKind): string | null {
  const projectPath = useProjectPath();
  return useWorkshopEditorStore((s) => {
    const editor = s.byProject[projectPath] ?? EMPTY_EDITOR;
    const leafId = editor.maximizedShellLeaf[kind];
    if (leafId === undefined) return null;
    return findLeaf(editor.shells[kind].layout, leafId) ? leafId : null;
  });
}

/** Fill one shell with one pane, or give its panes back. */
export function useToggleMaximizedShellLeaf(kind: ShellKind) {
  return useLeadAction("toggleMaximizedShellLeaf", kind);
}

/** Give one shell's panes back, which is what Esc asks for. */
export function useRestoreMaximizedShellLeaf(kind: ShellKind) {
  return useLeadAction("restoreMaximizedShellLeaf", kind);
}
