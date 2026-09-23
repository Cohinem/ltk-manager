import { queryOptions, skipToken } from "@tanstack/react-query";
import { convertFileSrc } from "@tauri-apps/api/core";

import { api, type AppError, type WorkshopProject } from "@/lib/tauri";
import { queryFn, queryFnWithArgs, unwrapForQuery } from "@/utils/query";

import { workshopKeys } from "../../shared/api/keys";

export const projectDetailsQueries = {
  all: () =>
    queryOptions<WorkshopProject[], AppError>({
      queryKey: workshopKeys.projects(),
      queryFn: queryFn(api.getWorkshopProjects),
    }),

  byPath: (projectPath: string | undefined) =>
    queryOptions<WorkshopProject, AppError>({
      queryKey: workshopKeys.project(projectPath ?? ""),
      queryFn: projectPath ? queryFnWithArgs(api.getWorkshopProject, projectPath) : skipToken,
    }),

  /* The answer is the final asset URL rather than a raw path, so `setQueryData`
     can inject a cache-busted URL directly. */
  thumbnail: (projectPath: string, thumbnailPath: string | null | undefined) =>
    queryOptions<string, AppError>({
      queryKey: workshopKeys.thumbnail(projectPath, thumbnailPath),
      queryFn: thumbnailPath
        ? async () => {
            const path = unwrapForQuery(await api.getProjectThumbnail(thumbnailPath));
            return path ? convertFileSrc(path) : "";
          }
        : skipToken,
      staleTime: Infinity,
    }),
} as const;
