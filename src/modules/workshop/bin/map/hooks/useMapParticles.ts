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
import { useBackdropMaterials } from "@/modules/viewport";

import { systemModel } from "../../skin/utils/skinScene";
import type { SystemModel } from "../../vfx/engine/model/model";
import { vfxQueries } from "../../vfx/hooks/useVfxSystem";
import { mapQueries } from "../api/mapQueries";
import { isHidden } from "../utils/mapOutline";
import { particlesBySystem, playedParticles } from "../utils/mapParticles";

/** One system a map plays, and every place the map stands it. */
export interface MapParticleGroup {
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

/* Declared once, so the query client answers the same array for as long as no read moves. */
function modelsOf(results: UseQueryResult<VfxSystem, AppError>[]): (SystemModel | null)[] {
  return results.map((result) => (result.data === undefined ? null : systemModel(result.data)));
}

/**
 * The particle systems a map stands in its scene, read out of its open `.materials.bin`.
 *
 * A map declares its particles and the systems they play in that one file, so every read
 * here is against `document`. Each system joins as its read lands, and a null `document`
 * reads nothing. What the visibility `flags` leave off, and what an outliner hid by chunk or
 * by placeable, is left out.
 */
export function useMapParticles(
  document: BinDocumentId | null,
  flags: number,
  hidden: ReadonlySet<string> = NONE_HIDDEN,
): readonly MapParticleGroup[] {
  const placed = useQuery(mapQueries.particles(document));

  const played = useMemo(() => {
    const shown = playedParticles(placed.data ?? [], flags).filter(
      (particle) => !isHidden(hidden, particle.chunk, particle.key),
    );
    return [...particlesBySystem(shown)];
  }, [placed.data, flags, hidden]);
  const models = useQueries({
    queries: document === null ? [] : played.map(([entry]) => vfxQueries.system(document, entry)),
    combine: modelsOf,
  });

  const groups = useMemo(
    () =>
      played.flatMap(([entry, particles], at) => {
        const system = models[at];
        return system == null ? [] : [{ entry, system, particles }];
      }),
    [played, models],
  );

  return groups;
}
