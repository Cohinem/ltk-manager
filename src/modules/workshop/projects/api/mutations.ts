import { mutationOptions, type QueryClient } from "@tanstack/react-query";
import { convertFileSrc } from "@tauri-apps/api/core";

import {
  api,
  type AppError,
  type CreateProjectArgs,
  type SaveProjectConfigArgs,
  type WorkshopProject,
} from "@/lib/tauri";
import { mutationFn, unwrapForQuery } from "@/utils/query";

import { workshopKeys } from "../../shared/api/keys";
import { useWorkshopEditorStore } from "../../state";
import { addProject, replaceProject } from "./cache";
export interface RenameProjectVariables {
  projectPath: string;
  newName: string;
}

export interface SetThumbnailVariables {
  projectPath: string;
  imagePath: string;
}

export interface RemoveThumbnailVariables {
  projectPath: string;
}

export const projectDetailsMutations = {
  create: (client: QueryClient) =>
    mutationOptions<WorkshopProject, AppError, CreateProjectArgs>({
      mutationFn: async (args) => unwrapForQuery(await api.createWorkshopProject(args)),
      onSuccess: (created) => addProject(client, created),
    }),

  remove: (client: QueryClient) =>
    mutationOptions<void, AppError, string>({
      mutationFn: async (projectPath) =>
        unwrapForQuery(await api.deleteWorkshopProject(projectPath)),
      onSuccess: (_answer, projectPath) => {
        client.setQueryData<WorkshopProject[]>(workshopKeys.projects(), (old) =>
          old?.filter((project) => project.path !== projectPath),
        );
        client.removeQueries({ queryKey: workshopKeys.project(projectPath) });

        /* The editor persists its strip under the project path, and a deleted
           project never comes back to claim it. */
        useWorkshopEditorStore.getState().forgetProject(projectPath);
      },
    }),

  /* The path is what changed, so every project query goes rather than one entry. */
  rename: (client: QueryClient) =>
    mutationOptions<WorkshopProject, AppError, RenameProjectVariables>({
      mutationFn: async ({ projectPath, newName }) =>
        unwrapForQuery(await api.renameWorkshopProject(projectPath, newName)),
      onSuccess: () => {
        client.invalidateQueries({ queryKey: workshopKeys.projects() });
      },
    }),

  saveConfig: (client: QueryClient) =>
    mutationOptions<WorkshopProject, AppError, SaveProjectConfigArgs>({
      mutationFn: async (args) => unwrapForQuery(await api.saveProjectConfig(args)),
      onSuccess: (updated) => replaceProject(client, updated),
    }),

  setThumbnail: (client: QueryClient) =>
    mutationOptions<WorkshopProject, AppError, SetThumbnailVariables>({
      /* ThumbnailSection and NewProjectDialog report. */
      meta: { silentError: true },
      mutationFn: mutationFn(({ projectPath, imagePath }: SetThumbnailVariables) =>
        api.setProjectThumbnail(projectPath, imagePath),
      ),
      onSuccess: (updated) => {
        replaceProject(client, updated);

        /* The backend path never changes - always thumbnail.webp - so
           `convertFileSrc` answers the URL the webview already has cached. The
           timestamp is what makes it fetch the new file. */
        if (updated.thumbnailPath) {
          client.setQueryData(
            workshopKeys.thumbnail(updated.path, updated.thumbnailPath),
            `${convertFileSrc(updated.thumbnailPath)}?v=${Date.now()}`,
          );
        }
      },
    }),

  removeThumbnail: (client: QueryClient) =>
    mutationOptions<WorkshopProject, AppError, RemoveThumbnailVariables>({
      /* ThumbnailSection reports. */
      meta: { silentError: true },
      mutationFn: mutationFn(({ projectPath }: RemoveThumbnailVariables) =>
        api.removeProjectThumbnail(projectPath),
      ),
      onSuccess: (updated) => {
        replaceProject(client, updated);
        client.removeQueries({
          queryKey: workshopKeys.thumbnail(updated.path, ""),
          exact: false,
        });
      },
    }),
} as const;
