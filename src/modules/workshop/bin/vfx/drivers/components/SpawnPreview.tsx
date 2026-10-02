import { useEffect, useMemo } from "react";
import { Box3, BufferAttribute, BufferGeometry, Matrix4, Sphere, Vector3 } from "three";

import { m } from "@/i18n";
import { AXIS_SIGN, type SceneColors, useSceneColors } from "@/modules/viewport";
import { twMerge } from "@/utils";

import type { EmitterModel, SpawnShape } from "../../engine/model/model";
import { identityInto } from "../../engine/utils/basis";
import { spawnFrameInto } from "../../rendering/utils/emitterShape";
import { NODE_PREVIEW_SIZE } from "../utils/driverLayout";
import { bodyMatrixInto, type ShapeBody, shapeBody } from "../utils/shapeBody";
import { cloudReach, type SpawnCloud, spawnCloud } from "../utils/spawnCloud";
import { NODE_BOX, Turntable } from "./NodePreviews";
import { PreviewView } from "./PreviewView";
import { SpawnBody } from "./SpawnBody";

const BOX_STYLE = { width: NODE_PREVIEW_SIZE, height: NODE_PREVIEW_SIZE } as const;

/** How far the axes reach, as a share of the cloud's reach. */
const AXIS_SHARE = 0.3;

/** How far each arm of a lone spawn point's crosshair reaches, as a share of the cloud's reach. */
const CROSS_SHARE = 0.12;

/**
 * The marks' opacities, which stay under the figure so they read as guides at node size: the
 * emitter's axes, the stem from its origin to the spawn point, and the crosshair.
 */
const MARK_OPACITY = { axes: 0.35, stem: 0.25, cross: 0.6 } as const;

/** The least radius a body is framed at, so a body of almost no size is not zoomed into. */
const LEAST_RADIUS = 0.5;

const IDENTITY = identityInto(new Float32Array(9));
const ORIGIN: [number, number, number] = [0, 0, 0];

/** What a spawn shape draws as: its body where it has one, else the one place it spawns at. */
export interface Drawn {
  readonly cloud: SpawnCloud;
  readonly body: ShapeBody | null;
  /** Where the body stands, turned by the spawn frame and mirrored as the viewport's is. */
  readonly matrix: Matrix4;
  /** The body's box, or the spawn point's, as the view places it. */
  readonly box: Box3;
}

/**
 * The spawn shape of `emitter` as an analytic figure, turning: a box, sphere or cylinder as its
 * body in faint faces under crisp edges, and a legacy shape as the box its births span, read
 * off `spawnCloud`. The caption gives the size on each axis. A point marks where it spawns
 * with a crosshair, the emitter's axes and a stem from them, and the caption gives the place.
 *
 * A shape of no size spawns every particle at one point, so it draws as a dim body of its kind
 * at a size of one, with a caption saying so.
 */
export function ShapePreview({ emitter }: { emitter: EmitterModel | undefined }) {
  const zero = emitter !== undefined && zeroSized(emitter.shape);
  const drawn = useMemo(
    () => (emitter === undefined ? null : drawnOf(emitter, zero)),
    [emitter, zero],
  );
  useEffect(
    () => () => {
      drawn?.body?.faces.dispose();
      drawn?.body?.edges.dispose();
      drawn?.body?.turns?.dispose();
    },
    [drawn],
  );

  const size = drawn === null ? null : sizeOf(drawn.box);
  const at = drawn === null ? null : placeOf(drawn.box);

  return (
    <div className="relative my-1 shrink-0 self-center" style={BOX_STYLE}>
      <PreviewView className={twMerge(NODE_BOX, "my-0 size-full")}>
        {drawn !== null && <SpawnScene drawn={drawn} zero={zero} />}
      </PreviewView>
      {zero && (
        <span className="pointer-events-none absolute inset-x-0 bottom-1.5 text-center text-fine text-surface-400">
          {m.workshop_bin_graph_shape_zero_label()}
        </span>
      )}
      {!zero && drawn?.body != null && size !== null && (
        <Caption>
          {m.workshop_bin_graph_shape_size_label({ x: size[0]!, y: size[1]!, z: size[2]! })}
        </Caption>
      )}
      {!zero && drawn?.body === null && at !== null && (
        <Caption>
          {m.workshop_bin_graph_shape_point_label({ x: at[0]!, y: at[1]!, z: at[2]! })}
        </Caption>
      )}
    </div>
  );
}

/** The figure `emitter`'s spawn shape draws as, a shape of no size at a unit size when `zero`. */
export function drawnOf(emitter: EmitterModel, zero: boolean): Drawn {
  const cloud = spawnCloud(emitter);
  const shape = zero ? (UNIT_SHAPE[emitter.shape.kind] ?? emitter.shape) : emitter.shape;
  const body = shapeBody(shape, cloud);
  const frame = new Float32Array(9);
  spawnFrameInto(emitter, IDENTITY, IDENTITY, frame);
  const matrix = bodyMatrixInto(frame, ORIGIN, emitter.translationOverride, new Matrix4());

  let box = new Box3(new Vector3(...cloud.low), new Vector3(...cloud.high));
  if (body !== null) {
    body.faces.computeBoundingBox();
    box = body.faces.boundingBox!.clone().applyMatrix4(matrix);
  }
  return { cloud, body, matrix, box };
}

function SpawnScene({ drawn, zero }: { drawn: Drawn; zero: boolean }) {
  const reach = cloudReach(drawn.cloud);
  const sphere = useMemo(() => boundsOf(drawn, reach), [drawn, reach]);
  const shift = sphere.center.clone().negate();

  return (
    <Turntable sphere={sphere}>
      <group position={shift}>
        <SpawnFigure drawn={drawn} zero={zero} />
      </group>
    </Turntable>
  );
}

/**
 * A spawn shape's figure in the emitter's own space: its body, or for a point the emitter's
 * axes, a stem from them and a crosshair where it spawns, drawn faint. Without `marks` a point
 * draws nothing.
 */
export function SpawnFigure({
  drawn,
  zero,
  marks: marked = true,
}: {
  drawn: Drawn;
  zero: boolean;
  marks?: boolean;
}) {
  const colors = useSceneColors();
  const reach = cloudReach(drawn.cloud);
  const marks = useMemo(
    () => (drawn.body === null && marked ? pointMarks(drawn.box, reach, colors) : null),
    [drawn, reach, colors, marked],
  );
  useEffect(() => () => marks?.forEach((each) => each.dispose()), [marks]);

  if (drawn.body !== null) {
    return <SpawnBody body={drawn.body} matrix={drawn.matrix} standIn={zero} />;
  }
  if (marks === null) return null;

  return (
    <>
      <lineSegments geometry={marks[0]}>
        <lineBasicMaterial vertexColors transparent opacity={MARK_OPACITY.axes} />
      </lineSegments>
      <lineSegments geometry={marks[1]}>
        <lineBasicMaterial color={colors.ink} transparent opacity={MARK_OPACITY.stem} />
      </lineSegments>
      <lineSegments geometry={marks[2]}>
        <lineBasicMaterial color={colors.gizmo} transparent opacity={MARK_OPACITY.cross} />
      </lineSegments>
    </>
  );
}

function lineGeometry(positions: Float32Array): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  return geometry;
}

/**
 * The sphere the camera frames: the body, or a spawn point with the emitter's origin and
 * half the cloud's reach around it, so the point keeps its surroundings.
 */
export function boundsOf(drawn: Drawn, reach: number): Sphere {
  const box = drawn.box.clone();
  if (drawn.body === null) box.expandByPoint(new Vector3());

  const sphere = box.getBoundingSphere(new Sphere());
  sphere.radius = Math.max(sphere.radius, drawn.body === null ? reach / 2 : LEAST_RADIUS);
  return sphere;
}

/** A spawn point's marks: the emitter's axes, the stem from its origin, and the crosshair. */
function pointMarks(box: Box3, reach: number, colors: SceneColors): BufferGeometry[] {
  const point = box.getCenter(new Vector3());
  return [
    axisGeometry(reach * AXIS_SHARE, colors),
    lineGeometry(new Float32Array([0, 0, 0, point.x, point.y, point.z])),
    crossGeometry(point, reach * CROSS_SHARE),
  ];
}

/** The emitter's three axes from its origin, `length` long, mirrored as the viewport's are. */
function axisGeometry(length: number, colors: SceneColors): BufferGeometry {
  const positions = new Float32Array(18);
  const tints = new Float32Array(18);
  const axisColors = [colors.axisX, colors.axisY, colors.axisZ];
  for (let axis = 0; axis < 3; axis += 1) {
    positions[axis * 6 + 3 + axis] = length * AXIS_SIGN[axis]!;
    const { r, g, b } = axisColors[axis]!;
    tints.set([r, g, b, r, g, b], axis * 6);
  }

  const geometry = lineGeometry(positions);
  geometry.setAttribute("color", new BufferAttribute(tints, 3));
  return geometry;
}

/** Three arms `arm` long crossing at `point`. */
function crossGeometry(point: Vector3, arm: number): BufferGeometry {
  const positions = new Float32Array(18);
  for (let axis = 0; axis < 3; axis += 1) {
    for (let side = 0; side < 2; side += 1) {
      positions.set([point.x, point.y, point.z], axis * 6 + side * 3);
      positions[axis * 6 + side * 3 + axis] += side === 0 ? -arm : arm;
    }
  }
  return lineGeometry(positions);
}

/** The box's size on each axis, rounded to a unit. */
function sizeOf(box: Box3): number[] {
  const size = box.getSize(new Vector3());
  return [size.x, size.y, size.z].map(Math.round);
}

/** Where a spawn point lands, back in the bin's own axes. */
function placeOf(box: Box3): number[] {
  const point = box.getCenter(new Vector3());
  return [point.x, point.y, point.z].map(
    (value, axis) => Math.round(value * AXIS_SIGN[axis]!) || 0,
  );
}

function Caption({ children }: { children: string }) {
  return (
    <span className="pointer-events-none absolute right-1.5 bottom-1 font-mono text-fine text-surface-400 tabular-nums">
      {children}
    </span>
  );
}

/** A shape whose volume or surface has no extent, which spawns at its centre. */
export function zeroSized(shape: SpawnShape): boolean {
  switch (shape.kind) {
    case "box":
      return shape.size.every((extent) => extent === 0);
    case "sphere":
    case "cylinder":
      return shape.radius === 0;
    case "point":
    case "legacy":
      return false;
  }
}

/** The body a shape of no size stands in with: its kind at a size of one. */
const UNIT_SHAPE: Partial<Record<SpawnShape["kind"], SpawnShape>> = {
  box: { kind: "box", size: [1, 1, 1], volume: false },
  sphere: { kind: "sphere", radius: 1, volume: false },
  cylinder: { kind: "cylinder", radius: 1, height: 1, volume: false },
};
