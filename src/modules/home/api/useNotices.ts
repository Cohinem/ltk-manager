import { useQuery } from "@tanstack/react-query";

import { api, type AppError, type Notice } from "@/lib/tauri";
import { queryFn } from "@/utils/query";

import { homeKeys } from "./keys";

/** Half an hour, which is how quickly a notice the project publishes reaches a running app. */
const NOTICES_STALE_MS = 30 * 60 * 1000;

/** The notices that concern this build right now, newest first. */
export function useNotices() {
  return useQuery<Notice[], AppError>({
    queryKey: homeKeys.notices(),
    queryFn: queryFn(api.listNotices),
    staleTime: NOTICES_STALE_MS,
    retry: 1,
  });
}
