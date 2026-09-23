import type { AbilityRecipe } from "../../bin/spells/utils/abilityRecipe";
import type { EditorSet } from "./editorRoot";
import { dropStops } from "./navigationStack";
import { setProject } from "./projectUpdate";

/** What a project's own life asks of the editor: its recipes, a rename, a delete. */
export interface ProjectActions {
  saveAbility: (projectPath: string, recipe: AbilityRecipe) => void;
  removeAbility: (projectPath: string, id: string) => void;
  /** Follows a project whose path changed, so a rename keeps its editor. */
  moveProject: (fromPath: string, toPath: string) => void;
  /** Drops a deleted project, which would otherwise sit in storage forever. */
  forgetProject: (projectPath: string) => void;
}

/** These actions, closed over the writer of the store that holds them. */
export function createProjectActions(set: EditorSet): ProjectActions {
  return {
    saveAbility: (projectPath, recipe) =>
      setProject(set, projectPath, (editor) => ({
        ...editor,
        abilities: [...(editor.abilities ?? []).filter((item) => item.id !== recipe.id), recipe],
      })),
    removeAbility: (projectPath, id) =>
      setProject(set, projectPath, (editor) => ({
        ...editor,
        abilities: (editor.abilities ?? []).filter((item) => item.id !== id),
      })),

    moveProject: (fromPath, toPath) =>
      set((state) => {
        const current = state.byProject[fromPath];
        if (!current || fromPath === toPath) return state;

        const byProject = { ...state.byProject };
        delete byProject[fromPath];
        byProject[toPath] = current;

        /* The stops keep pointing at the editor they were recorded in, which the
           rename moved rather than replaced. */
        const history = state.history.map((entry) =>
          entry.kind === "document" && entry.project === fromPath
            ? { ...entry, project: toPath }
            : entry,
        );
        const closed = state.closed.map((tab) =>
          tab.project === fromPath ? { ...tab, project: toPath } : tab,
        );
        return { byProject, history, closed };
      }),

    forgetProject: (projectPath) =>
      set((state) => {
        if (!(projectPath in state.byProject)) return state;

        const byProject = { ...state.byProject };
        delete byProject[projectPath];
        const stack = dropStops(
          state,
          (entry) => entry.kind === "document" && entry.project === projectPath,
        );
        const closed = state.closed.filter((tab) => tab.project !== projectPath);
        return { byProject, ...stack, closed };
      }),
  };
}
