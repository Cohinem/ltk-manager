import { SpinnerGapIcon } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";

import { Button } from "@/components";
import { errorSummary, m } from "@/i18n";
import type { AppError, ObjectIndexStatus } from "@/lib/tauri";

import { useObjectDeclarations, useWarmObjectIndex } from "../../../gameBrowser";
import { uiKeys } from "../api/uiQueries";

/**
 * What the canvas says for a view whose base loadable `loadable` another file declares: the build
 * of the object index that finds it, while it runs, and the view read again once it is ready.
 */
export function BaseElsewhereNotice({ loadable }: { loadable: string }) {
  const hashes = useMemo(() => [loadable], [loadable]);
  const { data, error } = useObjectDeclarations(hashes);
  const warm = useWarmObjectIndex();
  const queryClient = useQueryClient();
  const status = data?.index.status;

  const asked = useRef(false);
  useEffect(() => {
    if (status !== "ready" || asked.current) return;

    asked.current = true;
    void queryClient.invalidateQueries({ queryKey: uiKeys.views });
  }, [status, queryClient]);

  return (
    <div
      data-ui="BaseElsewhereNotice"
      className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-4 text-center text-meta text-surface-400 select-none"
    >
      <NoticeBody
        index={data?.index}
        error={error}
        building={warm.isPending}
        onBuild={() => warm.mutate()}
      />
    </div>
  );
}

interface NoticeBodyProps {
  readonly index: ObjectIndexStatus | undefined;
  readonly error: AppError | null;
  /** A build this notice asked for has not answered yet. */
  readonly building: boolean;
  readonly onBuild: () => void;
}

function NoticeBody({ index, error, building, onBuild }: NoticeBodyProps) {
  if (error !== null) return <span>{errorSummary(error)}</span>;
  if (index?.status === "failed") return <span>{errorSummary(index.error)}</span>;
  if (index?.status === "ready") return <span>{m.workshop_bin_atlas_base_missing_empty()}</span>;
  if (index === undefined || index.status === "building" || building) {
    return (
      <span className="flex items-center gap-1.5">
        <SpinnerGapIcon className="size-3.5 animate-spin" />
        {m.workshop_objects_building_label()}
      </span>
    );
  }

  return (
    <>
      <span>{m.workshop_bin_atlas_base_elsewhere_empty()}</span>
      <Button variant="outline" size="xs" onClick={onBuild}>
        {m.workshop_bin_build_index_action()}
      </Button>
    </>
  );
}
