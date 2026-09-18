import type { EditorSet } from "./editorRoot";
import { NO_COLLAPSED_DIRS } from "./projectEditor";
import { setProject } from "./projectUpdate";

/** What the layer panels read: the selected layer, the shut directories, a scroll. */
export interface LayerActions {
  selectLayer: (projectPath: string, layerName: string) => void;
  toggleCollapsed: (projectPath: string, layerName: string, path: string) => void;
  reveal: (projectPath: string, layerName: string, path: string) => void;
}

/** These actions, closed over the writer of the store that holds them. */
export function createLayerActions(set: EditorSet): LayerActions {
  return {
    selectLayer: (projectPath, layerName) =>
      setProject(set, projectPath, (editor) =>
        editor.selectedLayer === layerName ? null : { ...editor, selectedLayer: layerName },
      ),

    toggleCollapsed: (projectPath, layerName, path) =>
      setProject(set, projectPath, (editor) => {
        const next = new Set(editor.collapsed[layerName] ?? NO_COLLAPSED_DIRS);
        if (next.has(path)) next.delete(path);
        else next.add(path);

        return { ...editor, collapsed: { ...editor.collapsed, [layerName]: next } };
      }),

    reveal: (projectPath, layerName, path) =>
      setProject(set, projectPath, (editor) => ({
        ...editor,
        reveal: { layerName, path, token: (editor.reveal?.token ?? 0) + 1 },
      })),
  };
}
