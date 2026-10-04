import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo } from "react";
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  LineBasicMaterial,
  LineSegments,
  Points,
  PointsMaterial,
} from "three";

import type { Pose } from "../../animation/evaluation/pose";
import { isSocketed } from "../../animation/evaluation/socketedPose";
import type { SceneClock } from "../../animation/state/clock";
import type { Colliders } from "../../dynamics/model";
import type { DynamicsRig } from "../../dynamics/take";
import type { SceneColors } from "../../scene/hooks/sceneColors";
import { AXIS_SIGN } from "../../scene/utils/world";
import {
  CAPSULE_VERTICES,
  carryInto,
  type DrawnJoint,
  drawnJoints,
  GROUND_VERTICES,
  sidesInto,
  SOCKET_VERTICES,
  SPHERE_VERTICES,
  sphereInto,
  vertexInto,
} from "../utils/dynamicsOverlayModel";
import { OVER_EVERYTHING } from "../utils/overlayMaterial";

/** A simulated joint's dot, in pixels at any distance. */
const JOINT_PX = 7;

/** The overlay draws over the character and its armature. */
const OVER_THE_ARMATURE = 12;

/** How long a socket's axes are drawn, in engine units. */
const SOCKET_AXIS = 12;

/** Half the side of the square the ground plane is outlined with, in engine units. */
const GROUND_HALF = 120;

/** The corners of the ground's outline in order, as the signs of its half side on X and Z. */
const CORNERS = [-1, -1, 1, -1, 1, 1, -1, 1];

const NO_COLLIDERS: readonly Colliders[] = [];
const NO_JOINTS: readonly DrawnJoint[] = [];

export interface DynamicsOverlayProps {
  /** The pose the character draws, simulated and with its sockets. */
  readonly pose: Pose;
  readonly clock: SceneClock;
  /** `skinScale`, which the character is drawn at. */
  readonly scale: number;
  readonly colors: SceneColors;
  /** The built modifiers, and null for a skin with none. */
  readonly rig: DynamicsRig | null;
  /** The collision shapes of every chain, each placed on its joints. */
  readonly colliders?: readonly Colliders[];
  /** Each socket's axes are drawn, and a line from it to the joint it rides. */
  readonly sockets?: boolean;
  /**
   * How strongly each joint is tinted, 0 to 1 by slot, which is the selected parameter
   * evaluated along its tree. Null tints every simulated joint alike.
   */
  readonly tint?: ArrayLike<number> | null;
}

/** One socket as the overlay draws it. */
interface DrawnSocket {
  readonly slot: number;
  /** The joint the socket rides, by slot, and -1 for one that rides none. */
  readonly parent: number;
}

/**
 * What the dynamics of a skin are, drawn over the character: its simulated joints, their
 * collision radii, the shapes they collide with, the lateral links, the ground the chains
 * rest on, and its sockets.
 *
 * "The physics pane" in docs/ux/SKIN_EDITOR.md. Everything is read off the pose at the
 * clock's time, so the overlay stands where the character does on a seek.
 */
export function DynamicsOverlay({
  pose,
  clock,
  scale,
  colors,
  rig,
  colliders = NO_COLLIDERS,
  sockets: drawSockets = true,
  tint = null,
}: DynamicsOverlayProps) {
  const joints = useMemo(() => (rig === null ? NO_JOINTS : drawnJoints(rig, scale)), [rig, scale]);
  const ringed = useMemo(() => joints.filter((joint) => joint.radius > 0), [joints]);

  const links = useMemo(() => {
    if (rig === null) return [];

    return rig.chains.flatMap((chain) =>
      chain.links.map((link) => [chain.joint[link.a], chain.joint[link.b]] as const),
    );
  }, [rig]);
  const groundY = rig?.chains[0]?.groundY ?? null;

  const sockets = useMemo<DrawnSocket[]>(() => {
    if (!drawSockets || !isSocketed(pose)) return [];

    return pose.sockets
      .map((socket, index) => ({
        slot: pose.socketSlot(index),
        parent: socket.kind === "singleJoint" ? socket.parent : -1,
      }))
      .filter((socket) => socket.slot >= 0);
  }, [pose, drawSockets]);

  const spheres = useMemo(() => colliders.flatMap((each) => each.spheres), [colliders]);
  const capsules = useMemo(() => colliders.flatMap((each) => each.capsules), [colliders]);

  const dotCount = joints.length;
  const socketCount = sockets.length;
  const ringVertices = ringed.length * SPHERE_VERTICES;
  const shapeVertices = spheres.length * SPHERE_VERTICES + capsules.length * CAPSULE_VERTICES;
  const linkVertices = links.length * 2;
  const groundVertices = groundY === null ? 0 : GROUND_VERTICES;
  const lineVertices =
    ringVertices + shapeVertices + linkVertices + groundVertices + socketCount * SOCKET_VERTICES;

  const materials = useMemo(
    () => ({
      dots: new PointsMaterial({
        vertexColors: true,
        size: JOINT_PX,
        sizeAttenuation: false,
        ...OVER_EVERYTHING,
      }),
      lines: new LineBasicMaterial({ vertexColors: true, ...OVER_EVERYTHING }),
    }),
    [],
  );

  useEffect(
    () => () => {
      materials.dots.dispose();
      materials.lines.dispose();
    },
    [materials],
  );

  /* Keyed on the counts, so an edit that moves no count keeps the buffers it has. */
  const drawn = useMemo(() => {
    const lines = new LineSegments(coloured(lineVertices), materials.lines);
    const dots = new Points(coloured(dotCount), materials.dots);

    [lines, dots].forEach((object, layer) => {
      object.frustumCulled = false;
      object.renderOrder = OVER_THE_ARMATURE + layer;
    });

    return { lines, dots };
  }, [materials, dotCount, lineVertices]);

  useEffect(
    () => () => {
      drawn.lines.geometry.dispose();
      drawn.dots.geometry.dispose();
    },
    [drawn],
  );

  /* The colours change with the tint and the theme, and never with the frame. */
  useLayoutEffect(() => {
    const mixed = new Color();
    const dotColors = drawn.dots.geometry.getAttribute("color");

    joints.forEach((joint, at) => {
      if (joint.pinned) {
        mixed.copy(colors.markerOther);
      } else {
        mixed.copy(colors.grid).lerp(colors.gizmo, tint === null ? 1 : (tint[joint.slot] ?? 0));
      }

      mixed.toArray(dotColors.array, at * 3);
    });
    dotColors.needsUpdate = true;

    const lineColors = drawn.lines.geometry.getAttribute("color");
    let at = 0;
    const paint = (count: number, color: Color) => {
      for (let vertex = at; vertex < at + count; vertex += 1) {
        color.toArray(lineColors.array, vertex * 3);
      }

      at += count;
    };

    paint(ringVertices, colors.wire);
    paint(shapeVertices, colors.markerOther);
    paint(linkVertices, colors.markerParticle);
    paint(groundVertices, colors.gridMajor);

    for (let socket = 0; socket < socketCount; socket += 1) {
      paint(2, colors.axisX);
      paint(2, colors.axisY);
      paint(2, colors.axisZ);
      paint(2, colors.gizmo);
    }
    lineColors.needsUpdate = true;
  }, [
    drawn,
    joints,
    tint,
    colors,
    ringVertices,
    shapeVertices,
    linkVertices,
    groundVertices,
    socketCount,
  ]);

  const world = useMemo(() => new Float32Array(16), []);

  useFrame(() => {
    const time = clock.time;
    /* The lengths are in world units, and the overlay draws in the skeleton's. */
    const unit = scale || 1;

    const dots = drawn.dots.geometry.getAttribute("position");
    const marks = dots.array as Float32Array;

    for (let index = 0; index < joints.length; index += 1) {
      const m = pose.worldInto(joints[index].slot, time, world);
      vertexInto(marks, index * 3, m[12], m[13], m[14]);
    }
    dots.needsUpdate = true;

    const lines = drawn.lines.geometry.getAttribute("position");
    const out = lines.array as Float32Array;
    let at = 0;

    for (let index = 0; index < ringed.length; index += 1) {
      const m = pose.worldInto(ringed[index].slot, time, world);
      at = sphereInto(out, at, m[12], m[13], m[14], ringed[index].radius);
    }

    for (let index = 0; index < spheres.length; index += 1) {
      const shape = spheres[index];
      carryInto(END_A, pose.worldInto(shape.joint, time, world), shape.centre);
      at = sphereInto(out, at, END_A[0], END_A[1], END_A[2], shape.radius / unit);
    }

    for (let index = 0; index < capsules.length; index += 1) {
      const shape = capsules[index];
      const radiusA = shape.radiusA / unit;
      const radiusB = shape.radiusB / unit;
      carryInto(END_A, pose.worldInto(shape.jointA, time, world), shape.endA);
      carryInto(END_B, pose.worldInto(shape.jointB, time, world), shape.endB);

      at = sphereInto(out, at, END_A[0], END_A[1], END_A[2], radiusA);
      at = sphereInto(out, at, END_B[0], END_B[1], END_B[2], radiusB);

      sidesInto(SIDES, END_A, END_B);
      for (let side = 0; side < SIDES.length; side += 3) {
        at = vertexInto(
          out,
          at,
          END_A[0] + SIDES[side] * radiusA,
          END_A[1] + SIDES[side + 1] * radiusA,
          END_A[2] + SIDES[side + 2] * radiusA,
        );
        at = vertexInto(
          out,
          at,
          END_B[0] + SIDES[side] * radiusB,
          END_B[1] + SIDES[side + 1] * radiusB,
          END_B[2] + SIDES[side + 2] * radiusB,
        );
      }
    }

    for (let index = 0; index < links.length; index += 1) {
      const start = pose.worldInto(links[index][0], time, world);
      at = vertexInto(out, at, start[12], start[13], start[14]);

      const end = pose.worldInto(links[index][1], time, world);
      at = vertexInto(out, at, end[12], end[13], end[14]);
    }

    if (groundY !== null) {
      const half = GROUND_HALF / unit;

      for (let corner = 0; corner < CORNERS.length; corner += 2) {
        const next = (corner + 2) % CORNERS.length;
        at = vertexInto(out, at, CORNERS[corner] * half, groundY, CORNERS[corner + 1] * half);
        at = vertexInto(out, at, CORNERS[next] * half, groundY, CORNERS[next + 1] * half);
      }
    }

    const reach = SOCKET_AXIS / unit;

    for (let index = 0; index < sockets.length; index += 1) {
      const { slot, parent } = sockets[index];
      const m = pose.worldInto(slot, time, world);
      const x = m[12];
      const y = m[13];
      const z = m[14];

      for (let axis = 0; axis < 12; axis += 4) {
        const stretch = reach / (Math.hypot(m[axis], m[axis + 1], m[axis + 2]) || 1);
        at = vertexInto(out, at, x, y, z);
        at = vertexInto(
          out,
          at,
          x + m[axis] * stretch,
          y + m[axis + 1] * stretch,
          z + m[axis + 2] * stretch,
        );
      }

      /* The line to the joint the socket rides, and no line for one that rides none. */
      at = vertexInto(out, at, x, y, z);
      if (parent >= 0) {
        const ridden = pose.worldInto(parent, time, world);
        at = vertexInto(out, at, ridden[12], ridden[13], ridden[14]);
      } else {
        at = vertexInto(out, at, x, y, z);
      }
    }
    lines.needsUpdate = true;
  });

  return (
    <group scale={[AXIS_SIGN[0] * scale, AXIS_SIGN[1] * scale, AXIS_SIGN[2] * scale]}>
      <primitive object={drawn.lines} />
      <primitive object={drawn.dots} />
    </group>
  );
}

/** A geometry of `vertices` vertices, each with a position and a colour. */
function coloured(vertices: number): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(vertices * 3), 3));
  geometry.setAttribute("color", new BufferAttribute(new Float32Array(vertices * 3), 3));
  return geometry;
}

/* Scratch of the frame: the two ends of a capsule, and the four directions across it. */
const END_A = new Float32Array(3);
const END_B = new Float32Array(3);
const SIDES = new Float32Array(12);
