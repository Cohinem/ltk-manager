import { useEffect } from "react";

import { lendDocumentSave } from "@/modules/editor";

import { useSandbox } from "../../../sandbox/state/SandboxContext";
import { binSaveKey, saveBinNow } from "../../../state";
import { useMapScene } from "../state/mapScene";

/**
 * Adds the scene's `.mapgeo` and its queued `.materials.bin` to each requested save of the tab
 * `documentId`, so `Ctrl+S` from any pane and the bar's Save cover them.
 *
 * Resolves if the `.mapgeo` fails, because `saveGeometry` already showed a toast for it.
 */
export function useMapTabSave(documentId: string | null): void {
  const { saveGeometry, materials, materialsAsset } = useMapScene();
  const sandbox = useSandbox();

  useEffect(() => {
    if (documentId === null) return;

    return lendDocumentSave(documentId, async () => {
      const bin =
        materials === null || materialsAsset === null
          ? undefined
          : saveBinNow(binSaveKey(sandbox, materialsAsset), materials);

      await Promise.all([saveGeometry(), bin]);
    });
  }, [documentId, saveGeometry, materials, materialsAsset, sandbox]);
}
