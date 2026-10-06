import { useEffect, useMemo } from "react";

import type { BinDocumentId } from "@/lib/tauri";
import { type Edges, jointAnchor, type Pose, useSceneColors } from "@/modules/viewport";

import type { Joints } from "../../engine/model/rig";
import type { Driver } from "../../engine/simulation/driver";
import type { Source } from "../../engine/simulation/particleRead";
import { useEmissionSurfaces } from "../hooks/useEmissionSurfaces";
import type { EmitterMeshes } from "../hooks/useVfxMeshes";
import { samplersOf, type VfxTextures } from "../hooks/useVfxTextures";
import { type PickRegistry, type PickScope, PickScopeContext } from "../state/pick";
import { WireframeContext } from "../state/wire";
import type { DrawnEmitter } from "../utils/definitions";
import {
  drawsAsBeam,
  drawsAsMesh,
  drawsAsProjection,
  drawsAsQuad,
  drawsAsTrail,
  drawsTheAttachment,
} from "../utils/drawKind";
import type { BoundUnit } from "../utils/emissionSurface";
import { AttachedMeshes } from "./AttachedMeshes";
import { Beams } from "./Beams";
import { Meshes } from "./Meshes";
import { Projections } from "./Projections";
import { Quads } from "./Quads";
import { Trails } from "./Trails";

export interface VfxSystemProps {
  /** Every emitter of the system and its children, from `drawnEmitters`. */
  readonly drawn: readonly DrawnEmitter[];
  /** The simulation whose pools the emitters draw. */
  readonly driver: Driver;
  readonly textures: VfxTextures;
  readonly meshes: EmitterMeshes;
  /** An emitter the draw leaves out, such as every one but the emitter soloed. */
  readonly hiddenOf?: (definition: DrawnEmitter) => boolean;
  /** Which triangle edges the emitters draw. */
  readonly edges?: Edges;
  /** How many particles one quad emitter's buffers hold, and the kit's own where unset. */
  readonly room?: number;
  /**
   * The document the system was read from, whose project the game's shaders resolve
   * through, and the install alone where unset.
   */
  readonly document?: BinDocumentId | null;
  /**
   * Draws the pools and leaves the driver's mesh joints and emission surfaces to the view
   * that owns the driver, for a second view of the same run.
   */
  readonly drawOnly?: boolean;
  /** Where the drawn emitters register for a click to pick, and nowhere where unset. */
  readonly picks?: PickRegistry;
  /** The unit the system is bound to. Its pose is used for the emission surfaces. */
  readonly unit?: BoundUnit | null;
}

/**
 * One particle system's emitters drawn from its driver's pools, inside any scene.
 *
 * The clock is the owner's, so the shell's run and a character wearing several systems
 * spend time on their drivers each in their own way (ADR-0037).
 */
export function VfxSystem({
  drawn,
  driver,
  textures,
  meshes,
  hiddenOf = noneHidden,
  edges = "none",
  room,
  document = null,
  drawOnly = false,
  picks,
  unit = null,
}: VfxSystemProps) {
  useEmissionSurfaces(drawn, drawOnly ? null : driver, unit);
  const joints = useMemo(() => {
    const lookups = new Map<string, Joints>();
    for (const [key, buffers] of meshes) {
      const pose = buffers.pose?.source;
      if (pose !== undefined) lookups.set(key, jointsOf(pose));
    }

    return lookups;
  }, [meshes]);

  useEffect(() => {
    if (!drawOnly) driver.setMeshJoints(joints);
  }, [driver, joints, drawOnly]);

  const rootSources = useMemo(() => [driver], [driver]);
  const sourcesOf = (definition: DrawnEmitter): readonly Source[] =>
    definition.path === "" ? rootSources : driver.sources(definition.path);
  const { wire: colour } = useSceneColors();
  const wire = useMemo(() => ({ edges, colour }), [edges, colour]);
  const scopes = useMemo(
    () =>
      new Map<string, PickScope | null>(
        drawn.map((definition) => [
          definition.key,
          picks === undefined ? null : { registry: picks, owner: definition },
        ]),
      ),
    [drawn, picks],
  );
  const scopeOf = (definition: DrawnEmitter) => scopes.get(definition.key) ?? null;

  return (
    <WireframeContext value={wire}>
      {drawn
        .filter((definition) => drawsAsQuad(definition.emitter))
        .map((definition) => (
          <PickScopeContext key={definition.key} value={scopeOf(definition)}>
            <Quads
              emitter={definition.emitter}
              sources={sourcesOf(definition)}
              samplers={samplersOf(textures, definition)}
              rank={definition.rank}
              hidden={hiddenOf(definition)}
              room={room}
              document={document}
            />
          </PickScopeContext>
        ))}
      {drawn
        .filter((definition) => drawsAsProjection(definition.emitter))
        .map((definition) => (
          <PickScopeContext key={definition.key} value={scopeOf(definition)}>
            <Projections
              emitter={definition.emitter}
              sources={sourcesOf(definition)}
              samplers={samplersOf(textures, definition)}
              rank={definition.rank}
              hidden={hiddenOf(definition)}
              room={room}
            />
          </PickScopeContext>
        ))}
      {drawn
        .filter((definition) => drawsAsTrail(definition.emitter))
        .map((definition) => (
          <PickScopeContext key={definition.key} value={scopeOf(definition)}>
            <Trails
              emitter={definition.emitter}
              sources={sourcesOf(definition)}
              samplers={samplersOf(textures, definition)}
              rank={definition.rank}
              hidden={hiddenOf(definition)}
              document={document}
            />
          </PickScopeContext>
        ))}
      {drawn
        .filter((definition) => drawsAsBeam(definition.emitter))
        .map((definition) => (
          <PickScopeContext key={definition.key} value={scopeOf(definition)}>
            <Beams
              emitter={definition.emitter}
              sources={sourcesOf(definition)}
              samplers={samplersOf(textures, definition)}
              rank={definition.rank}
              hidden={hiddenOf(definition)}
              document={document}
            />
          </PickScopeContext>
        ))}
      {drawn
        .filter((definition) => drawsAsMesh(definition.emitter))
        .map((definition) => {
          const buffers = meshes.get(definition.key);
          if (buffers === undefined) return null;
          return (
            <PickScopeContext key={definition.key} value={scopeOf(definition)}>
              <Meshes
                emitter={definition.emitter}
                sources={sourcesOf(definition)}
                buffers={buffers}
                samplers={samplersOf(textures, definition)}
                rank={definition.rank}
                hidden={hiddenOf(definition)}
                document={document}
              />
            </PickScopeContext>
          );
        })}
      {drawn
        .filter((definition) => drawsTheAttachment(definition.emitter))
        .map((definition) => (
          <PickScopeContext key={definition.key} value={scopeOf(definition)}>
            <AttachedMeshes
              emitter={definition.emitter}
              sources={sourcesOf(definition)}
              samplers={samplersOf(textures, definition)}
              rank={definition.rank}
              hidden={hiddenOf(definition)}
              document={document}
            />
          </PickScopeContext>
        ))}
    </WireframeContext>
  );
}

function noneHidden(): boolean {
  return false;
}

/* One lookup per pose, so a mesh landing leaves the other emitters' lookups identical and
   `driver.setMeshJoints` replays only when a pose was added or removed. */
const JOINTS = new WeakMap<Pose, Joints>();

function jointsOf(pose: Pose): Joints {
  let joints = JOINTS.get(pose);
  if (joints === undefined) {
    joints = (name) => {
      const slot = pose.jointNamed(name);
      return slot < 0 ? null : jointAnchor(pose, slot, [0, 0, 0], 1);
    };
    JOINTS.set(pose, joints);
  }
  return joints;
}
