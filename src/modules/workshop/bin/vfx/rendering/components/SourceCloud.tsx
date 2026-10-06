import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { BufferAttribute, BufferGeometry, Color } from "three";

import { useSceneColors } from "@/modules/viewport";

import type { EmitterModel, SystemModel } from "../../engine/model/model";
import type { Point } from "../../engine/model/rig";
import type { Driver } from "../../engine/simulation/driver";
import { worldOf } from "../../engine/simulation/integrate";
import { frameOf } from "../../engine/simulation/particleRead";
import { FRAME_SLOTS } from "../../engine/simulation/pool";
import { sampleCurveInto } from "../../engine/utils/sampleCurve";
import { placeInto, spawnFrameInto, spawnOriginInto } from "../utils/emitterShape";
import { CLOUD_BIRTHS, sourceCloudInto } from "../utils/sourceCloud";

export interface SourceCloudProps {
  readonly system: SystemModel;
  readonly driver: Driver;
  /** An emitter of the opened system that names an emission mesh or surface. */
  readonly emitter: EmitterModel;
  /** The colour of the points and lines. Defaults to the gizmo colour. */
  readonly color?: Color;
}

/** The size of one point, in pixels. */
const POINT_SIZE = 3;

/**
 * An overlay of birth positions sampled from an emitter's emission mesh and surface, with a
 * line along each birth's direction.
 *
 * The positions are sampled every frame from the samplers the simulation uses, so they follow
 * the host's pose and have the engine's distribution. "The emission source" in
 * docs/ux/BIN_EDITOR.md.
 */
export function SourceCloud({ system, driver, emitter, color }: SourceCloudProps) {
  const colors = useSceneColors();
  const points = useMemo(() => new Float32Array(CLOUD_BIRTHS * 3), []);
  const ticks = useMemo(() => new Float32Array(CLOUD_BIRTHS * 6), []);
  const world = useMemo(() => worldOf(system), [system]);
  const pointGeometry = useRef<BufferGeometry>(null);
  const pointAttribute = useRef<BufferAttribute>(null);
  const tickGeometry = useRef<BufferGeometry>(null);
  const tickAttribute = useRef<BufferAttribute>(null);

  useFrame(() => {
    const surfaces = driver.surfaces().get("")?.get(emitter.index);
    if (surfaces === undefined) {
      pointGeometry.current?.setDrawRange(0, 0);
      tickGeometry.current?.setDrawRange(0, 0);
      return;
    }

    const frame = frameOf(driver, emitter);
    spawnFrameInto(emitter, world.basis, frame.orientation, FRAME);
    STANDS.fill(0);
    sampleCurveInto(emitter.emitterPosition, frame.phase, STANDS, 0);
    spawnOriginInto(emitter, world, frame.orientation, frame.origin, ORIGIN);
    const origin: Point = [ORIGIN[0], ORIGIN[1], ORIGIN[2]];

    const { births, directed } = sourceCloudInto(
      surfaces,
      emitter,
      driver.elapsed,
      STANDS,
      points,
      ticks,
    );
    for (let at = 0; at < births; at += 1) placeInto(points, at * 3, FRAME, origin);
    for (let at = 0; at < directed * 2; at += 1) placeInto(ticks, at * 3, FRAME, origin);

    pointGeometry.current?.setDrawRange(0, births);
    tickGeometry.current?.setDrawRange(0, directed * 2);
    if (pointAttribute.current !== null) pointAttribute.current.needsUpdate = true;
    if (tickAttribute.current !== null) tickAttribute.current.needsUpdate = true;
  });

  const tone = color ?? colors.gizmo;

  return (
    <>
      <points frustumCulled={false} renderOrder={1}>
        <bufferGeometry ref={pointGeometry}>
          <bufferAttribute ref={pointAttribute} attach="attributes-position" args={[points, 3]} />
        </bufferGeometry>
        <pointsMaterial color={tone} size={POINT_SIZE} sizeAttenuation={false} depthTest={false} />
      </points>
      <lineSegments frustumCulled={false} renderOrder={1}>
        <bufferGeometry ref={tickGeometry}>
          <bufferAttribute ref={tickAttribute} attach="attributes-position" args={[ticks, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color={tone} transparent opacity={TICK_OPACITY} depthTest={false} />
      </lineSegments>
    </>
  );
}

/** The opacity of a direction line, lower than a point's so the points stay visible. */
const TICK_OPACITY = 0.45;

/** The emitter's spawn frame this frame, as `integrate.ts` builds it. */
const FRAME = new Float32Array(FRAME_SLOTS);

/** `EmitterPosition` sampled this frame. */
const STANDS = new Float32Array(3);

/** The origin of the emitter's frame this frame. */
const ORIGIN = new Float32Array(3);
