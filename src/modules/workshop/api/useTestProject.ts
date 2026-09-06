import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { AppError } from "@/lib/tauri";
import { patcherKeys, startPatcherSpendingQueue } from "@/modules/patcher";
import { usePatcherSessionStore } from "@/stores";
import { unwrapForQuery } from "@/utils/query";

interface TestProjectsArgs {
  projects: Array<{ path: string; displayName: string }>;
}

export function useTestProjects() {
  const queryClient = useQueryClient();
  const setTestingProjects = usePatcherSessionStore((s) => s.setTestingProjects);

  return useMutation<void, AppError, TestProjectsArgs>({
    mutationFn: async ({ projects }) => {
      const result = await startPatcherSpendingQueue({
        workshopProjects: projects.map((p) => p.path),
      });
      return unwrapForQuery(result);
    },
    onMutate: ({ projects }) => {
      setTestingProjects(projects);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: patcherKeys.status() });
    },
    onError: () => {
      setTestingProjects([]);
    },
  });
}
