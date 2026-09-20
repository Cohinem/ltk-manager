import { useQuery } from "@tanstack/react-query";
import { createContext, type ReactNode, use, useCallback, useMemo, useState } from "react";

import type { AssetRef, BinDocumentId, MapPath, MapVariant } from "@/lib/tauri";

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

/** What names the map a scene draws: an object of a map's own classes, or one of its files. */
export type MapSceneSource =
  | {
      readonly kind: "object";
      readonly document: BinDocumentId;
      /** The `Map`, `MapSkin` or `MapContainer` object, and null where the view holds no row. */
      readonly entry: string | null;
    }
  | { readonly kind: "file"; readonly map: MapPath };

/** One map's scene, shared by the panes that draw it and list it. */
export interface MapSceneState {
  /** Any asset of the project whose layers answer before the install. */
  readonly near: AssetRef;
  /** The maps the source draws, and undefined while they read. */
  readonly variants: readonly MapVariant[] | undefined;
  /** The variants could not be read. */
  readonly failed: boolean;
  /** The variant drawn, and null while the variants read and where the source names none. */
  readonly chosen: MapVariant | null;
  readonly pick: (map: MapPath) => void;
  /** Where the chosen variant's files live has been answered. */
  readonly located: boolean;
  /** The chosen variant's `.mapgeo`, and null where nothing holds one. */
  readonly geometry: AssetRef | null;
  /** The chosen variant's `.materials.bin` is one something holds, open or not yet. */
  readonly hasMaterials: boolean;
  /** The open `.materials.bin` of the chosen variant, and null until it is open. */
  readonly materials: BinDocumentId | null;
  /** The chunks and placeables the reader hid, by chunk entry and by `itemId`. */
  readonly hidden: ReadonlySet<string>;
  readonly setHidden: (id: string, hidden: boolean) => void;
  readonly focus: MapFocus | null;
  readonly focusOn: (focus: MapFocus) => void;
}

const MapSceneContext = createContext<MapSceneState | null>(null);

/** The scene of the map in view, which a pane that draws or lists a map is always under. */
export function useMapScene(): MapSceneState {
  const scene = use(MapSceneContext);
  if (scene === null) throw new Error("useMapScene read outside a MapSceneHost");
  return scene;
}

export interface MapSceneHostProps {
  /** Off, this holds nothing and reads nothing. */
  readonly enabled?: boolean;
  /** Any asset of the project whose layers answer before the install for the map's files. */
  readonly near: AssetRef;
  readonly source: MapSceneSource;
  readonly children: ReactNode;
}

/**
 * The map scene above whatever draws it, so a change of frame keeps the skin the reader
 * picked and what they hid.
 *
 * It holds the chosen variant's `.materials.bin` open, because the preview and the
 * outliner both read that one file and neither outlives the other.
 */
export function MapSceneHost({ enabled = true, children, ...props }: MapSceneHostProps) {
  if (!enabled) return children;
  return <MapSceneProvider {...props}>{children}</MapSceneProvider>;
}

function MapSceneProvider({ near, source, children }: Omit<MapSceneHostProps, "enabled">) {
  const object = source.kind === "object" ? source : null;
  const read = useQuery(mapQueries.variants(object?.document ?? null, object?.entry ?? null));
  const file = source.kind === "file" ? source.map : null;
  const listed = useMemo<readonly MapVariant[] | undefined>(
    () => (file === null ? read.data : [{ skin: null, map: file }]),
    [file, read.data],
  );
  const failed = read.error !== null;

  const [picked, setPicked] = useState<MapPath | null>(null);
  const chosen = useMemo(
    () =>
      listed === undefined
        ? null
        : (listed.find((variant) => variant.map === picked) ?? openingVariant(listed)),
    [listed, picked],
  );

  const files = useQuery(mapQueries.files(near, chosen?.map ?? null)).data;
  const materialsFile = files?.materials ?? null;
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
      near,
      variants: listed,
      failed,
      chosen,
      pick,
      located: files !== undefined,
      geometry: files?.geometry ?? null,
      hasMaterials: materialsFile !== null,
      materials: materialsFile === null ? null : opened,
      hidden,
      setHidden,
      focus,
      focusOn: setFocus,
    }),
    [near, listed, failed, chosen, pick, files, materialsFile, opened, hidden, setHidden, focus],
  );

  return (
    <MapSceneContext value={scene}>
      {materialsFile !== null && (
        /* Keyed, so a change of map lets the last handle go before the next answers. */
        <DocumentOpener key={assetKey(materialsFile)} asset={materialsFile} onOpen={setOpened} />
      )}
      {children}
    </MapSceneContext>
  );
}
