import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { type PerspectiveCamera, Sphere, Vector3 } from "three";

import { AXIS_SIGN } from "@/modules/viewport";

import {
  appearance,
  drawnPlace,
  drawnPlaceInto,
  frameOf,
  type Source,
} from "../../engine/simulation/particleRead";
import { useVfxRun } from "../../playback/state/run";
import type { EmitterMeshes } from "../../rendering/hooks/useVfxMeshes";
import type { DrawnEmitter } from "../../rendering/utils/definitions";

type Triple = [number, number, number];

/** Where a preview's camera stands, what it looks at, and how far apart the two are. */
export interface Framing {
  readonly position: Triple;
  readonly target: Triple;
  readonly distance: number;
}

/** The least radius the camera frames, so one particle or a short trail still has room. */
const LEAST_RADIUS = 20;

/** The camera's distance as a factor of the one that holds the particles' sphere whole. */
const MARGIN = 1.15;

/** How a follow frames what it measures: the least radius it holds, and its margin. */
export interface Fit {
  readonly least: number;
  readonly margin: number;
}

const FOLLOW_FIT: Fit = { least: LEAST_RADIUS, margin: MARGIN };

/** How fast the framing catches up, a second's share: quickly out, slowly back in. */
const GROW_RATE = 10;
const SHRINK_RATE = 1.5;

const PLACED = drawnPlace();
const DRAWN = { scale: new Float32Array(3), color: new Float32Array(4) };
const LOW = new Vector3();
const HIGH = new Vector3();
const POINT = new Vector3();
const ANCHOR = new Vector3();
const UP = new Vector3(0, 1, 0);

interface Held {
  readonly target: Vector3;
  radius: number;
}

/* What `measure` finds on a frame, eased into each preview's own `Held`. */
const MEASURED: Held = { target: new Vector3(), radius: 0 };

/**
 * A node preview's camera following the live particles of `drawn`, each padded by its size,
 * along the direction `framing` looks from.
 *
 * A mesh particle's size is its scale times the reach of its mesh from the pivot, read off
 * `meshes`, since the scale alone frames a camera inside any mesh larger than a unit.
 *
 * It eases toward what it measures, out faster than in, so a birth or a death does not jolt
 * it, and it holds still while none lives. It stands on `framing` until the first particle.
 * `source` is the run's driver unless a preview runs its own, and `turn` walks the camera round
 * what it looks at, in radians a second. `anchor` writes the point the camera stays on, which
 * the framing then holds the particles about, so particles born at scattered places change how
 * far it stands and never where it looks. `fit` is the least radius it holds and its margin.
 */
export function FollowFraming({
  drawn,
  meshes,
  framing,
  source,
  turn = 0,
  anchor,
  fit = FOLLOW_FIT,
}: {
  drawn: readonly DrawnEmitter[];
  meshes: EmitterMeshes;
  framing: Framing;
  source?: Source;
  turn?: number;
  anchor?: (out: Vector3) => Vector3;
  fit?: Fit;
}) {
  const { driver } = useVfxRun();
  const read = source ?? driver;
  const held = useRef<Held | null>(null);
  const angle = useRef(0);

  useFrame((state, delta) => {
    angle.current += delta * turn;
    const measured = measure(read, drawn, meshes, fit.least);
    if (anchor !== undefined && measured !== null) widenAround(measured, anchor(ANCHOR));
    let now = held.current;
    if (now === null) {
      if (measured === null) return;

      now = { target: measured.target.clone(), radius: measured.radius };
      held.current = now;
    } else if (measured !== null) {
      const rate = measured.radius > now.radius ? GROW_RATE : SHRINK_RATE;
      const share = 1 - Math.exp(-delta * rate);
      now.target.lerp(measured.target, share);
      now.radius += (measured.radius - now.radius) * share;
    }

    place(state.camera as PerspectiveCamera, now, framing, angle.current, fit.margin);
  });

  return null;
}

/** `measured` as the sphere about `anchor` that holds it whole. */
function widenAround(measured: Held, anchor: Vector3): void {
  measured.radius += measured.target.distanceTo(anchor);
  measured.target.copy(anchor);
}

/** The sphere holding the live particles of `drawn`'s own emitters, and null while none lives. */
function measure(
  source: Source,
  drawn: readonly DrawnEmitter[],
  meshes: EmitterMeshes,
  least: number,
): Held | null {
  const pool = source.pool;
  LOW.set(Infinity, Infinity, Infinity);
  HIGH.set(-Infinity, -Infinity, -Infinity);

  let found = false;
  for (const { emitter, path, key } of drawn) {
    if (path !== "") continue;

    const reach = meshReach(meshes, key);
    const frame = frameOf(source, emitter);
    for (let at = 0; at < pool.count; at += 1) {
      if (pool.emitter[at] !== emitter.index) continue;

      drawnPlaceInto(pool, at, frame, PLACED);
      appearance(pool, at, emitter, frame.now, DRAWN);
      const size =
        Math.max(Math.abs(DRAWN.scale[0]), Math.abs(DRAWN.scale[1]), Math.abs(DRAWN.scale[2])) *
        reach;
      for (let axis = 0; axis < 3; axis += 1) {
        const value = PLACED.place[axis] * AXIS_SIGN[axis];
        LOW.setComponent(axis, Math.min(LOW.getComponent(axis), value - size));
        HIGH.setComponent(axis, Math.max(HIGH.getComponent(axis), value + size));
      }
      found = true;
    }
  }
  if (!found) return null;

  MEASURED.target.copy(LOW).add(HIGH).multiplyScalar(0.5);
  MEASURED.radius = Math.max(HIGH.distanceTo(LOW) / 2, least);
  return MEASURED;
}

/** How far the mesh of the emitter drawn as `key` reaches from its pivot, and 1 for no mesh. */
function meshReach(meshes: EmitterMeshes, key: string): number {
  const geometry = meshes.get(key)?.geometry;
  if (geometry === undefined) return 1;

  if (geometry.boundingSphere === null) geometry.computeBoundingSphere();
  const sphere = geometry.boundingSphere ?? EMPTY;
  return sphere.center.length() + sphere.radius || 1;
}

const EMPTY = new Sphere();

/** The camera stood off `held` along the direction `framing` looks from, far enough to hold it. */
function place(
  camera: PerspectiveCamera,
  held: Held,
  framing: Framing,
  angle: number,
  margin: number,
): void {
  const direction = POINT.set(...framing.position)
    .sub(LOW.set(...framing.target))
    .normalize()
    .applyAxisAngle(UP, angle);
  const distance = (held.radius / Math.sin((camera.fov * Math.PI) / 360)) * margin;

  camera.position.copy(direction).multiplyScalar(distance).add(held.target);
  camera.lookAt(held.target);
  camera.near = distance / 100;
  camera.far = distance * 100;
  camera.updateProjectionMatrix();
}
