import { MapPinIcon, SelectionPlusIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { type RefObject, useCallback, useMemo, useRef, useState } from "react";

import { IconButton } from "@/components";
import { m } from "@/i18n";

import { mapQueries } from "../api/mapQueries";
import { useMapScene } from "../state/mapScene";
import { type PlacedItem, placedItems } from "../utils/mapOutline";
import { inRect, nearest, type ScreenRect, type SelectMode } from "../utils/mapSelection";
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
  const { materials, filter, select, markers } = useMapScene();
  const outline = useQuery(mapQueries.outline(materials));
  const items = useMemo(() => placedItems(outline.data ?? [], filter), [outline.data, filter]);
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

  return { items, shown: markers || boxing, boxing, setBoxing, projector, onBox };
}

/** The toolbar's switches for the markers and the box tool. */
export function PlaceableButtons({ picking }: { picking: PlaceablePicking }) {
  const { setMarkers } = useMapScene();

  return (
    <>
      <IconButton
        pressed={picking.shown}
        icon={<MapPinIcon />}
        onClick={() => {
          setMarkers(!picking.shown);
          if (picking.shown) picking.setBoxing(false);
        }}
        label={m.workshop_bin_map_markers_label()}
      />
      <IconButton
        pressed={picking.boxing}
        icon={<SelectionPlusIcon />}
        onClick={() => picking.setBoxing(!picking.boxing)}
        label={m.workshop_bin_map_box_select_label()}
      />
    </>
  );
}
