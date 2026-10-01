import { type SelectedModule, sameSelectedModule } from "../../bin/documents/state/editorFile";
import type { EditorSet } from "./editorRoot";
import { renamedDocument, renamedLayer } from "./layerRename";
import { NO_COLLAPSED_DIRS } from "./projectEditor";
import { setProject } from "./projectUpdate";

/** What the layer panels read: the selected layer and module, the shut directories, a scroll. */
export interface LayerActions {
  selectLayer: (projectPath: string, layerName: string) => void;
  setUseDeclarations: (projectPath: string, on: boolean) => void;
  /** Mark the rows a layer's declarations touch in a declared document, or leave them unmarked. */
  setMarkLayerShown: (projectPath: string, layerName: string, shown: boolean) => void;
  selectModule: (projectPath: string, selected: SelectedModule | null) => void;
  toggleCollapsed: (projectPath: string, layerName: string, path: string) => void;
  openDirs: (projectPath: string, layerName: string, paths: readonly string[]) => void;
  /** Collapse exactly `paths` in one layer's tree, which is how every directory collapses at once. */
  collapseDirs: (projectPath: string, layerName: string, paths: ReadonlySet<string>) => void;
  reveal: (projectPath: string, layerName: string, path: string) => void;
  /** Update the editor after a layer rename: tabs, selected layer and folds use the new name. */
  renameLayer: (projectPath: string, from: string, to: string) => void;
}

/** These actions, closed over the writer of the store that holds them. */
export function createLayerActions(set: EditorSet): LayerActions {
  return {
    renameLayer: (projectPath, from, to) =>
      set((state) => {
        const editor = state.byProject[projectPath];
        const renamed = editor === undefined || from === to ? null : renamedLayer(editor, from, to);
        if (renamed === null) return state;

        const id = (held: string) => renamed.ids.get(held) ?? held;
        return {
          byProject: { ...state.byProject, [projectPath]: renamed.editor },
          history: state.history.map((entry) =>
            entry.kind === "document" && entry.project === projectPath
              ? { ...entry, documentId: id(entry.documentId) }
              : entry,
          ),
          closed: state.closed.map((tab) =>
            tab.project === projectPath
              ? { ...tab, document: renamedDocument(tab.document, from, to) }
              : tab,
          ),
        };
      }),

    selectLayer: (projectPath, layerName) =>
      setProject(set, projectPath, (editor) =>
        editor.selectedLayer === layerName ? null : { ...editor, selectedLayer: layerName },
      ),

    setUseDeclarations: (projectPath, on) =>
      setProject(set, projectPath, (editor) =>
        editor.useDeclarations === on ? null : { ...editor, useDeclarations: on },
      ),

    setMarkLayerShown: (projectPath, layerName, shown) =>
      setProject(set, projectPath, (editor) => {
        const hidden = editor.hiddenMarkLayers ?? [];
        if (hidden.includes(layerName) !== shown) return null;

        const next = shown ? hidden.filter((layer) => layer !== layerName) : [...hidden, layerName];
        return { ...editor, hiddenMarkLayers: next };
      }),

    selectModule: (projectPath, selected) =>
      setProject(set, projectPath, (editor) =>
        sameSelectedModule(editor.selectedModule, selected)
          ? null
          : { ...editor, selectedModule: selected },
      ),

    toggleCollapsed: (projectPath, layerName, path) =>
      setProject(set, projectPath, (editor) => {
        const next = new Set(editor.collapsed[layerName] ?? NO_COLLAPSED_DIRS);
        if (next.has(path)) next.delete(path);
        else next.add(path);

        return { ...editor, collapsed: { ...editor.collapsed, [layerName]: next } };
      }),

    openDirs: (projectPath, layerName, paths) =>
      setProject(set, projectPath, (editor) => {
        const shut = editor.collapsed[layerName] ?? NO_COLLAPSED_DIRS;
        if (paths.every((path) => !shut.has(path))) return null;

        const next = new Set(shut);
        for (const path of paths) next.delete(path);
        return { ...editor, collapsed: { ...editor.collapsed, [layerName]: next } };
      }),

    collapseDirs: (projectPath, layerName, paths) =>
      setProject(set, projectPath, (editor) => ({
        ...editor,
        collapsed: { ...editor.collapsed, [layerName]: new Set(paths) },
      })),

    reveal: (projectPath, layerName, path) =>
      setProject(set, projectPath, (editor) => ({
        ...editor,
        reveal: { layerName, path, token: (editor.reveal?.token ?? 0) + 1 },
      })),
  };
}
