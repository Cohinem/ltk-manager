import { useQueries, useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import type {
  AppError,
  AssetRef,
  BinDocumentId,
  MapParticle,
  MapPath,
  VfxSystem,
} from "@/lib/tauri";
import { type MapVisibility, useBackdropMaterials } from "@/modules/viewport";
import { usePreviewEffectsQuality } from "@/stores";

import { systemModel } from "../../skin/utils/skinScene";
import type { SystemModel } from "../../vfx/engine/model/model";
import { EFFECTS_QUALITIES } from "../../vfx/engine/model/quality";
import { vfxQueries } from "../../vfx/hooks/useVfxSystem";
import { mapQueries } from "../api/mapQueries";
import { isHidden } from "../utils/mapOutline";
import { particlesBySystem, playedParticles } from "../utils/mapParticles";

/** One system a map plays, and every place the map stands it. */
export interface MapParticleGroup {
  /** The open `.materials.bin` that declares the system. */
  readonly document: BinDocumentId;
  /** The system's object hash, which keys the group. */
  readonly entry: string;
  readonly system: SystemModel;
  readonly particles: readonly MapParticle[];
}

/** A map's `.materials.bin` as a scene holds it open, which is where its placeables live. */
export interface MapMaterialsFile {
  /** The file, for the scene to hold open, and null where there is none. */
  readonly source: AssetRef | null;
  /** Where the scene reports the handle of `source`, and null once it lets go. */
  readonly onOpen: (document: BinDocumentId | null) => void;
  /** The handle, once the file is open. */
  readonly document: BinDocumentId | null;
}

/** The `.materials.bin` of `map`, and nothing to open for a null one. */
export function useMapMaterialsFile(map: MapPath | null): MapMaterialsFile {
  const source = useBackdropMaterials(map);
  const [opened, setOpened] = useState<BinDocumentId | null>(null);
  return { source, onOpen: setOpened, document: source === null ? null : opened };
}

const NONE_HIDDEN: ReadonlySet<string> = new Set();

/** Which placements a map's read leaves out. */
export interface PlayedOptions {
  /** What an outliner hid, by chunk or by placeable. */
  readonly hidden?: ReadonlySet<string>;
  /** Also play a particle that starts disabled or whose controller is not visible. */
  readonly events?: boolean;
  /** The placeables the reader picked, by `itemId`, which play whatever turns them on. */
  readonly picked?: ReadonlySet<string>;
}

/**
 * Every group made, by its system and its particles. A system read that lands rebuilds the list,
 * and the cache keeps each other group the same object, so its placements skip the render.
 */
const GROUPS = new WeakMap<SystemModel, WeakMap<readonly MapParticle[], MapParticleGroup>>();

/** Returns the group of `system` at `particles`, the same object while its fields are the same. */
function groupOf(
  document: BinDocumentId,
  entry: string,
  system: SystemModel,
  particles: readonly MapParticle[],
): MapParticleGroup {
  let byParticles = GROUPS.get(system);
  if (byParticles === undefined) {
    byParticles = new WeakMap();
    GROUPS.set(system, byParticles);
  }

  const held = byParticles.get(particles);
  if (held !== undefined && held.document === document && held.entry === entry) return held;
  const made = { document, entry, system, particles };
  byParticles.set(particles, made);
  return made;
}

/* Declared once per quality, so the query client answers the same array for as long as no
   read moves. */
const MODELS_AT = EFFECTS_QUALITIES.map(
  (quality) =>
    (results: UseQueryResult<VfxSystem, AppError>[]): (SystemModel | null)[] =>
      results.map((result) =>
        result.data === undefined ? null : systemModel(result.data, quality),
      ),
);

/**
 * The particle systems a map stands in its scene, read out of its open `.materials.bin`.
 *
 * A map declares its particles and the systems they play in that one file, so every read
 * here is against `document`. Each system joins as its read lands, and a null `document`
 * reads nothing. A particle is left out if `visibility` does not draw it, if an outliner
 * hid its chunk or the particle itself, or if it is an event and `events` is off.
 */
export function useMapParticles(
  document: BinDocumentId | null,
  visibility: MapVisibility,
  { hidden = NONE_HIDDEN, events = false, picked = NONE_HIDDEN }: PlayedOptions = {},
): readonly MapParticleGroup[] {
  const placed = useQuery(mapQueries.particles(document));
  const quality = usePreviewEffectsQuality();

  const played = useMemo(() => {
    const shown = playedParticles(placed.data ?? [], visibility, events, picked).filter(
      (particle) => !isHidden(hidden, particle.chunk, particle.key),
    );
    return [...particlesBySystem(shown)];
  }, [placed.data, visibility, hidden, events, picked]);
  const models = useQueries({
    queries: document === null ? [] : played.map(([entry]) => vfxQueries.system(document, entry)),
    combine: MODELS_AT[quality],
  });

  const groups = useMemo(
    () =>
      played.flatMap(([entry, particles], at) => {
        const system = models[at];
        return system == null || document === null
          ? []
          : [groupOf(document, entry, system, particles)];
      }),
    [played, models, document],
  );

  return groups;
}
