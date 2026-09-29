import { createContext, use } from "react";

/** Moving a game-sandbox tab into the open project, where its edits become declarations. */
export interface ProjectSwitch {
  /** The project's name as the header shows it. */
  readonly project: string;
  readonly open: () => void;
}

/** The enclosing object tab's switch into the open project, null where it has none. ADR-0056. */
export const ProjectSwitchContext = createContext<ProjectSwitch | null>(null);

export function useProjectSwitchAction(): ProjectSwitch | null {
  return use(ProjectSwitchContext);
}
