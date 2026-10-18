import { SelectionPlusIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { type RefObject, useCallback, useMemo, useRef, useState } from "react";

import { IconButton } from "@/components";
import { m } from "@/i18n";

import { mapQueries } from "../api/mapQueries";
import { useMapScene } from "../state/mapScene";
import { type PlacedItem, placedItems } from "../utils/mapOutline";
import { inRect, nearest, type ScreenRect, type SelectMode } from "../utils/mapSelection";
import { withDragged } from "../utils/placeableSpace";
import type { MarkerProjector } from "./MapMarkers";

/** A box no wider or taller than this is a click, in pixels. */
const CLICK_SIZE = 4;

/** The viewport's picking of placeables: what it marks, and the box tool over them. */
export interface PlaceablePicking {
  /** Every placeable the outliner lists, which the markers draw. */
  readonly items: readonly PlacedItem[];
  /** The markers draw, which the box tool turns on with it. */
  readonly shown: boolean;
  readonly boxing: boolean;
  readonly setBoxing: (boxing: boolean) => void;
  readonly projector: RefObject<MarkerProjector | null>;
  readonly onBox: (rect: ScreenRect, mode: SelectMode) => void;
}

/**
 * The placeables the viewport marks and the box tool picks from, which are the outliner's
 * own under its search and chips. A box selects the markers inside it, a click the one
 * under it, and a click on nothing clears the selection.
 */
export function usePlaceablePicking(): PlaceablePicking {
  const { materials, filter, select, markers, dragged } = useMapScene();
  const outline = useQuery(mapQueries.outline(materials));
  const listed = useMemo(() => placedItems(outline.data ?? [], filter), [outline.data, filter]);
  const items = useMemo(() => withDragged(listed, dragged), [listed, dragged]);
  const [boxing, setBoxing] = useState(false);
  const projector = useRef<MarkerProjector | null>(null);

  const onBox = useCallback(
    (rect: ScreenRect, mode: SelectMode) => {
      const points = projector.current?.() ?? [];
      const ids = items.map((each) => each.id);
      const click = rect.right - rect.left <= CLICK_SIZE && rect.bottom - rect.top <= CLICK_SIZE;
      if (!click) {
        select(inRect(ids, points, rect), mode);
        return;
      }

      const hit = nearest(ids, points, [rect.left, rect.top]);
      if (hit !== null) select([hit], mode);
      else if (mode === "replace") select([], "replace");
    },
    [items, select],
  );

  return {
    items,
    shown: markers || boxing,
    boxing,
    setBoxing,
    projector,
    onBox,
  };
}

/** The box select tool, which picks the placeables inside a dragged box. */
export function BoxSelectButton({ picking }: { picking: PlaceablePicking }) {
  return (
    <IconButton
      pressed={picking.boxing}
      icon={<SelectionPlusIcon />}
      onClick={() => picking.setBoxing(!picking.boxing)}
      label={m.workshop_bin_map_box_select_label()}
    />
  );
}
