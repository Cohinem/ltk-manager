import { useQuery } from "@tanstack/react-query";
import { createContext, type ReactNode, use, useCallback, useMemo, useState } from "react";

import type { AssetRef, BinDocumentId, MapPath, MapVariant } from "@/lib/tauri";
import { type BackdropFlags, type BackdropSource, useBackdropFlags } from "@/modules/viewport";

import { assetKey } from "../../../preview/utils/assetRef";
import { useSandbox } from "../../../sandbox/state/SandboxContext";
import { DocumentOpener } from "../../skin/hooks/useGraphSource";
import { mapQueries } from "../api/mapQueries";
import { NO_FILTER, type OutlineFilter } from "../utils/mapOutline";
import { type SelectMode, selectedBy } from "../utils/mapSelection";
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
  /** Where that `.materials.bin` was read from, and null where nothing holds one. */
  readonly materialsAsset: AssetRef | null;
  /** The chunks and placeables the reader hid, by chunk entry and by `itemId`. */
  readonly hidden: ReadonlySet<string>;
  /** Hide or show one chunk or placeable, or several at once. */
  readonly setHidden: (ids: string | readonly string[], hidden: boolean) => void;
  readonly focus: MapFocus | null;
  readonly focusOn: (focus: MapFocus) => void;
  /** What the outliner lists, which the viewport's markers show the same of. */
  readonly filter: OutlineFilter;
  readonly setFilter: (filter: OutlineFilter) => void;
  /** The placeables the reader picked in the outliner or the viewport, by `itemId`. */
  readonly selected: ReadonlySet<string>;
  /** The placeable picked last, which the outliner scrolls to and the inspector shows. */
  readonly lead: string | null;
  readonly select: (ids: readonly string[], mode: SelectMode) => void;
  /** The viewport marks every placeable the outliner lists. */
  readonly markers: boolean;
  readonly setMarkers: (markers: boolean) => void;
  /**
   * The layers and the visibility controllers of the chosen variant, with the states that
   * the reader set. The preview draws by it and the Visibility pane edits it.
   */
  readonly backdrop: BackdropFlags;
}

const MapSceneContext = createContext<MapSceneState | null>(null);

const NONE: ReadonlySet<string> = new Set();

/** The scene of the map in view, which a pane that draws or lists a map is always under. */
export function useMapScene(): MapSceneState {
  const scene = use(MapSceneContext);
  if (scene === null) throw new Error("useMapScene read outside a MapSceneHost");
  return scene;
}

export interface MapSceneHostProps {
  /** Off, this holds nothing and reads nothing. */
  readonly enabled?: boolean;
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

function MapSceneProvider({ source, children }: Omit<MapSceneHostProps, "enabled">) {
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

  const sandbox = useSandbox();
  const files = useQuery(mapQueries.files(sandbox, chosen?.map ?? null)).data;
  const materialsFile = files?.materials ?? null;
  const [opened, setOpened] = useState<BinDocumentId | null>(null);

  /* The same map, document and geometry that the viewport draws its backdrop from, so the
     two share one read of the geometry and one of the model. Null until the viewport
     would draw, which is when the document that resolves the materials is known. */
  const resolver = object?.document ?? opened;
  const geometryFile = files?.geometry ?? null;
  const backdropSource = useMemo<BackdropSource | null>(() => {
    if (chosen === null || geometryFile === null) return null;
    if (materialsFile !== null && resolver === null) return null;

    return { map: chosen.map, document: resolver, geometry: geometryFile };
  }, [chosen, geometryFile, materialsFile, resolver]);
  const backdrop = useBackdropFlags(backdropSource);

  const [hidden, setHiddenIds] = useState<ReadonlySet<string>>(() => new Set());
  const setHidden = useCallback((ids: string | readonly string[], hide: boolean) => {
    setHiddenIds((held) => {
      const next = new Set(held);
      for (const id of typeof ids === "string" ? [ids] : ids) {
        if (hide) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const [filter, setFilter] = useState<OutlineFilter>(NO_FILTER);
  const [selected, setSelected] = useState<ReadonlySet<string>>(NONE);
  const [lead, setLead] = useState<string | null>(null);
  const [markers, setMarkers] = useState(false);
  const select = useCallback((ids: readonly string[], mode: SelectMode) => {
    setSelected((held) => selectedBy(held, ids, mode));
    setLead((held) => ids[0] ?? (mode === "replace" ? null : held));
  }, []);
  const pick = useCallback((map: MapPath) => {
    setPicked(map);
    setFocus(null);
    setSelected(NONE);
    setLead(null);
  }, []);

  const scene = useMemo<MapSceneState>(
    () => ({
      variants: listed,
      failed,
      chosen,
      pick,
      located: files !== undefined,
      geometry: files?.geometry ?? null,
      hasMaterials: materialsFile !== null,
      materials: materialsFile === null ? null : opened,
      materialsAsset: materialsFile,
      hidden,
      setHidden,
      focus,
      focusOn: setFocus,
      filter,
      setFilter,
      selected,
      lead,
      select,
      markers,
      setMarkers,
      backdrop,
    }),
    [
      listed,
      failed,
      chosen,
      pick,
      files,
      materialsFile,
      opened,
      hidden,
      setHidden,
      focus,
      filter,
      selected,
      lead,
      select,
      markers,
      backdrop,
    ],
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
