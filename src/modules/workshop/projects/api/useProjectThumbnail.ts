import { useQuery } from "@tanstack/react-query";

import { projectDetailsQueries } from "./queries";

/** A project thumbnail as a Tauri asset URL. */
export function useProjectThumbnail(projectPath: string, thumbnailPath?: string | null) {
  return useQuery(projectDetailsQueries.thumbnail(projectPath, thumbnailPath));
}
