import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useToast } from "@/components";
import { api, type AppError, type UndoReport } from "@/lib/tauri";
import { unwrapForQuery } from "@/utils/query";

import { workshopKeys } from "./keys";

interface UndoFixRunArgs {
  projectPath: string;
  stamp: string;
}

/**
 * Hook to reverse one fix run from its restore point.
 */
export function useUndoFixRun() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation<UndoReport, AppError, UndoFixRunArgs>({
    mutationFn: async ({ projectPath, stamp }) => {
      const result = await api.undoFixRun(projectPath, stamp);
      return unwrapForQuery(result);
    },
    onSuccess: (report, { projectPath }) => {
      // An undo restores files without re-running the rules, so marking the run
      // stale is what refills the panel.
      queryClient.invalidateQueries({ queryKey: workshopKeys.problems(projectPath) });
      queryClient.invalidateQueries({ queryKey: workshopKeys.fixRuns(projectPath) });
      queryClient.invalidateQueries({ queryKey: workshopKeys.contentTree(projectPath) });

      toast.success(
        `Restored ${report.restored} ${report.restored === 1 ? "file" : "files"} from the fix`,
      );
    },
    onError: (error) => {
      toast.error("Couldn't undo the fix", error.message);
    },
  });
}
