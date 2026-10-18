import { useCallback, useMemo } from "react";

import type { BinDocumentId } from "@/lib/tauri";

import { useBinRead } from "../../documents/hooks/useBinRead";
import { nameHash } from "../../shared/utils/binHash";
import { rowKey } from "../../tree/utils/binRows";
import { useMapScene } from "../state/mapScene";
import { COMPONENTS_STEP, componentRow } from "../utils/mapSettings";

/** The document a read with no `.materials.bin` open asks for, which reads nothing. */
const NO_DOCUMENT = 0 as BinDocumentId;

const COMPONENTS = nameHash("components");
const SUN_DIRECTION = nameHash("sunDirection");
const SUN_PROPERTIES = "MapSunProperties";

/** The most components a container lists that the edit looks through. */
const COMPONENT_ROWS = 200;

/**
 * Returns a function that writes `sunDirection` of the container's `MapSunProperties` as one undo
 * step, and null where the map takes no edits or the container has no sun component.
 */
export function useSunEdit(): ((direction: readonly [number, number, number]) => void) | null {
  const { materials, chosen, editable, apply } = useMapScene();
  const container = chosen === null ? null : nameHash(chosen.map);
  const listKey = container === null ? null : rowKey({ entry: container, path: COMPONENTS_STEP });
  const requests = useMemo(
    () => (listKey === null ? [] : [{ key: listKey, rows: COMPONENT_ROWS }]),
    [listKey],
  );
  const pages = useBinRead(materials ?? NO_DOCUMENT, requests);
  const components = listKey === null ? undefined : pages.get(listKey)?.rows;
  const sun = components === undefined ? null : componentRow(components, SUN_PROPERTIES);
  /* The item's index step, such as `[0]`, which a property edit of `components` starts from. */
  const index = sun === null ? null : sun.path.slice(COMPONENTS_STEP.length);

  const commit = useCallback(
    (direction: readonly [number, number, number]) => {
      if (container === null || index === null) return;

      void apply([
        {
          entry: container,
          holder: "",
          field: COMPONENTS,
          edits: [
            { type: "ensureProperty", path: index, field: SUN_DIRECTION },
            {
              type: "setLeaf",
              path: `${index}.${SUN_DIRECTION.slice(2)}`,
              value: { type: "vector", values: [...direction] },
            },
          ],
        },
      ]);
    },
    [container, index, apply],
  );

  return editable && index !== null ? commit : null;
}
