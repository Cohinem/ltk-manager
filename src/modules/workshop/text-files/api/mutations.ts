import { mutationOptions, type QueryClient } from "@tanstack/react-query";

import {
  api,
  type AppError,
  type ProjectText,
  type ProjectTextFile,
  type Revision,
} from "@/lib/tauri";
import { unwrapForQuery } from "@/utils/query";

import { workshopKeys } from "../../shared/api/keys";

export interface SaveProjectTextVariables {
  projectPath: string;
  file: ProjectTextFile;
  text: string;
  /** What the buffer was read as, or null to write over whatever is there. */
  expected: Revision | null;
}

/** Writes against a project's root text files. */
export const projectTextMutations = {
  /* The document resolves a refused save where the buffer is, so a toast would
     interrupt the one screen that can answer it. */
  save: (client: QueryClient) =>
    mutationOptions<ProjectText, AppError, SaveProjectTextVariables>({
      meta: { silentError: true },
      mutationFn: async ({ projectPath, file, text, expected }) =>
        unwrapForQuery(await api.projectText.save(projectPath, file, text, expected)),
      onSuccess: (saved, { projectPath, file }) =>
        client.setQueryData(workshopKeys.projectText(projectPath, file), saved),
    }),
} as const;
