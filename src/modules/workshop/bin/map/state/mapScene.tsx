import { useQuery } from "@tanstack/react-query";
import { createContext, type ReactNode, use, useCallback, useMemo, useState } from "react";

import type { BinDocumentId, MapPath, MapVariant } from "@/lib/tauri";

import { assetKey } from "../../../preview/utils/assetRef";
import { DocumentOpener } from "../../skin/hooks/useGraphSource";
import { mapQueries } from "../api/mapQueries";
import { openingVariant } from "../utils/mapVariants";

/** The placeable the camera was last sent to, a new one per send so the same row sends twice. */
export interface MapFocus {
  readonly id: string;
  /** Where it stands in the map's space. */
  readonly position: readonly [number, number, number];
}

/** One map object's scene, shared by the panes that draw it and list it. */
export interface MapSceneState {
  /** The maps the object draws, and undefined while they read. */
  readonly variants: readonly MapVariant[] | undefined;
  /** The variants could not be read. */
  readonly failed: boolean;
  /** The variant drawn, and null while the variants read and where the object names none. */
  readonly chosen: MapVariant | null;
  readonly pick: (map: MapPath) => void;
  /** The open `.materials.bin` of the chosen variant, and null until it is open. */
  readonly materials: BinDocumentId | null;
  /** The chunks and placeables the reader hid, by chunk entry and by `itemId`. */
  readonly hidden: ReadonlySet<string>;
  readonly setHidden: (id: string, hidden: boolean) => void;
  readonly focus: MapFocus | null;
  readonly focusOn: (focus: MapFocus) => void;
}

const MapSceneContext = createContext<MapSceneState | null>(null);

/** The scene of the map object in view, which a pane of a map shell is always under. */
export function useMapScene(): MapSceneState {
  const scene = use(MapSceneContext);
  if (scene === null) throw new Error("useMapScene read outside a MapSceneHost");
  return scene;
}

export interface MapSceneHostProps {
  /** The object is of a class that draws a map. Off, this holds nothing and reads nothing. */
  readonly enabled: boolean;
  readonly document: BinDocumentId;
  /** The `Map`, `MapSkin` or `MapContainer` object, and null where the view holds no row. */
  readonly entry: string | null;
  readonly children: ReactNode;
}

/**
 * The map scene above whichever frame draws it, so a change of frame keeps the skin the
 * reader picked and what they hid.
 *
 * It holds the chosen variant's `.materials.bin` open, because the preview and the
 * outliner both read that one file and neither outlives the other.
 */
export function MapSceneHost({ enabled, children, ...props }: MapSceneHostProps) {
  if (!enabled) return children;
  return <MapSceneProvider {...props}>{children}</MapSceneProvider>;
}

function MapSceneProvider({ document, entry, children }: Omit<MapSceneHostProps, "enabled">) {
  const read = useQuery(mapQueries.variants(document, entry));
  const [picked, setPicked] = useState<MapPath | null>(null);
  const listed = read.data;
  const failed = read.error !== null;
  const chosen = useMemo(
    () =>
      listed === undefined
        ? null
        : (listed.find((variant) => variant.map === picked) ?? openingVariant(listed)),
    [listed, picked],
  );

  const file = useQuery(mapQueries.gameFile(chosen?.materials ?? null)).data ?? null;
  const [opened, setOpened] = useState<BinDocumentId | null>(null);

  const [hidden, setHiddenIds] = useState<ReadonlySet<string>>(() => new Set());
  const setHidden = useCallback((id: string, hide: boolean) => {
    setHiddenIds((held) => {
      const next = new Set(held);
      if (hide) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const pick = useCallback((map: MapPath) => {
    setPicked(map);
    setFocus(null);
  }, []);

  const scene = useMemo<MapSceneState>(
    () => ({
      variants: listed,
      failed,
      chosen,
      pick,
      materials: file === null ? null : opened,
      hidden,
      setHidden,
      focus,
      focusOn: setFocus,
    }),
    [listed, failed, chosen, pick, file, opened, hidden, setHidden, focus],
  );

  return (
    <MapSceneContext value={scene}>
      {file !== null && (
        /* Keyed, so a change of map lets the last handle go before the next answers. */
        <DocumentOpener key={assetKey(file)} asset={file} onOpen={setOpened} />
      )}
      {children}
    </MapSceneContext>
  );
}
