import { mutationOptions, type QueryClient } from "@tanstack/react-query";

import {
  api,
  type AppError,
  type FantomePeekResult,
  type ImportFantomeArgs,
  type ImportGitRepoArgs,
  type WorkshopProject,
} from "@/lib/tauri";
import { mutationFn } from "@/utils/query";

import { addProject } from "../../projects/api/cache";

/** Ways a project arrives from outside the workshop. */
export const projectImportMutations = {
  fromFantome: (client: QueryClient) =>
    mutationOptions<WorkshopProject, AppError, ImportFantomeArgs>({
      mutationFn: mutationFn(api.importFromFantome),
      onSuccess: (created) => addProject(client, created),
    }),

  fromGitRepo: (client: QueryClient) =>
    mutationOptions<WorkshopProject, AppError, ImportGitRepoArgs>({
      mutationFn: mutationFn(api.importFromGitRepo),
      onSuccess: (created) => addProject(client, created),
    }),

  fromModpkg: (client: QueryClient) =>
    mutationOptions<WorkshopProject, AppError, string>({
      mutationFn: mutationFn(api.importFromModpkg),
      onSuccess: (created) => addProject(client, created),
    }),

  /** What a `.fantome` holds, read without unpacking it. */
  peekFantome: () =>
    mutationOptions<FantomePeekResult, AppError, string>({
      mutationFn: mutationFn(api.peekFantome),
    }),
} as const;
