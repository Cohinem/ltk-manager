import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  BufferAttribute,
  BufferGeometry,
  type Color,
  LineBasicMaterial,
  LineSegments,
  Points,
  PointsMaterial,
  Vector3,
} from "three";

import { boneSegments, colorFloats, jointColors, weighedJoints } from "./armatureModel";
import type { SceneClock } from "./clock";
import type { Pose } from "./pose";
import type { SceneColors } from "./sceneColors";
import { AXIS_SIGN } from "./world";

/** A joint's dot, in pixels at any distance. */
const JOINT_PX = 5;

/** The bones and the joints draw over the character, whatever stands in front of them. */
const OVER_THE_CHARACTER = 10;

/** Where a joint's world position sits in its column-major matrix. */
const AT_X = 12;

/** How far a name sits off its joint, in pixels, so the dot stays readable. */
const NAME_OFFSET = 4;

/** The padding around a name's text inside its plate, in pixels. */
const NAME_PAD = 2;

/** The token a name's plate is filled with, which the labels canvas reads off the root. */
const NAME_PLATE_TOKEN = "--color-scrim";

export interface ArmatureProps {
  readonly pose: Pose;
  /** The time the pose is sampled at, which whoever owns the scene advances. */
  readonly clock: SceneClock;
  /** `skinScale`, which the character is drawn at and the armature stands in. */
  readonly scale: number;
  readonly colors: SceneColors;
  /** A mask's weight per joint slot: the joints it weighs take the accent and the rest dim. */
  readonly jointWeights?: ArrayLike<number> | null;
  /**
   * A canvas over the scene each joint's name is written on, sized to the scene, and null
   * to write none. The owner mounts it outside the fibre, since the fibre holds no DOM.
   */
  readonly labels?: HTMLCanvasElement | null;
}

/**
 * The skeleton over the character: a dot per joint and a line to its parent, posed at the
 * clock's time, drawn through whatever the mesh puts in front of them.
 *
 * "The clips pane" in docs/ux/BIN_EDITOR.md. The names are painted on one 2D canvas over
 * the scene each frame, because a hundred DOM labels each moved by the fibre cost a frame
 * of layout apiece and a hundred `fillText` calls cost nothing a reader sees.
 */
export function Armature({
  pose,
  clock,
  scale,
  colors,
  jointWeights = null,
  labels = null,
}: ArmatureProps) {
  const { skeleton, parents } = pose;
  const count = skeleton.joints.length;
  const bones = useMemo(() => boneSegments(parents), [parents]);
  const weighed = useMemo(() => weighedJoints(count, jointWeights), [count, jointWeights]);
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const dpr = useThree((state) => state.viewport.dpr);

  const drawn = useMemo(() => {
    const joints = new BufferGeometry();
    joints.setAttribute("position", new BufferAttribute(new Float32Array(count * 3), 3));
    joints.setAttribute("color", new BufferAttribute(new Float32Array(colorFloats(count)), 3));
    const lines = new BufferGeometry();
    lines.setAttribute("position", new BufferAttribute(new Float32Array(bones.length * 6), 3));
    lines.setAttribute("color", new BufferAttribute(new Float32Array(bones.length * 6), 3));
    const dots = new Points(
      joints,
      new PointsMaterial({
        vertexColors: true,
        size: JOINT_PX,
        sizeAttenuation: false,
        depthTest: false,
        toneMapped: false,
      }),
    );
    const segments = new LineSegments(
      lines,
      new LineBasicMaterial({ vertexColors: true, depthTest: false, toneMapped: false }),
    );
    for (const object of [segments, dots]) {
      object.frustumCulled = false;
      object.renderOrder = OVER_THE_CHARACTER;
    }
    dots.renderOrder += 1;
    return { joints, lines, dots, segments };
  }, [count, bones]);

  useEffect(
    () => () => {
      drawn.joints.dispose();
      drawn.lines.dispose();
      drawn.dots.material.dispose();
      drawn.segments.material.dispose();
    },
    [drawn],
  );

  useLayoutEffect(() => {
    const palette = { plain: colors.wire, weighed: colors.gizmo, unweighed: colors.grid };
    const perJoint = jointColors(weighed, count, palette, new Float32Array(colorFloats(count)));
    const joints = drawn.joints.getAttribute("color");
    (joints.array as Float32Array).set(perJoint);
    joints.needsUpdate = true;
    const lines = drawn.lines.getAttribute("color");
    const into = lines.array as Float32Array;
    bones.forEach(([child], at) => {
      into.set(perJoint.subarray(child * 3, child * 3 + 3), at * 6);
      into.set(perJoint.subarray(child * 3, child * 3 + 3), at * 6 + 3);
    });
    lines.needsUpdate = true;
  }, [drawn, bones, weighed, count, colors]);

  /* The ink as CSS, since a 2D context takes no linear `Color`. */
  const ink = useMemo(
    () => ({ lit: css(colors.ink), dim: css(colors.untextured), plate: plateFill() }),
    [colors],
  );
  const worlds = useMemo(() => new Float32Array(count * 16), [count]);
  const projected = useMemo(() => new Vector3(), []);

  /* The labels canvas keeps the scene's size at the device's pixel density, and its font
     is what its own classes set, read once per size rather than per frame. */
  const type = useRef({ font: "", lineHeight: JOINT_PX * 2 });
  useLayoutEffect(() => {
    if (labels === null) return;
    labels.width = Math.round(size.width * dpr);
    labels.height = Math.round(size.height * dpr);
    labels.style.width = `${size.width}px`;
    labels.style.height = `${size.height}px`;
    const style = getComputedStyle(labels);
    type.current = {
      font: style.font,
      lineHeight: Number.parseFloat(style.lineHeight) || JOINT_PX * 2,
    };
  }, [labels, size, dpr]);

  useEffect(
    () => () => {
      labels?.getContext("2d")?.clearRect(0, 0, labels.width, labels.height);
    },
    [labels],
  );

  useFrame(() => {
    const time = clock.time;
    const positions = drawn.joints.getAttribute("position").array as Float32Array;
    for (let slot = 0; slot < count; slot += 1) {
      pose.worldInto(slot, time, worlds.subarray(slot * 16, (slot + 1) * 16));
      positions.set(worlds.subarray(slot * 16 + AT_X, slot * 16 + AT_X + 3), slot * 3);
    }
    drawn.joints.getAttribute("position").needsUpdate = true;

    const ends = drawn.lines.getAttribute("position").array as Float32Array;
    bones.forEach(([child, parent], at) => {
      ends.set(positions.subarray(child * 3, child * 3 + 3), at * 6);
      ends.set(positions.subarray(parent * 3, parent * 3 + 3), at * 6 + 3);
    });
    drawn.lines.getAttribute("position").needsUpdate = true;

    const context = labels?.getContext("2d") ?? null;
    if (labels === null || context === null) return;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, size.width, size.height);
    const { font, lineHeight } = type.current;
    context.font = font;
    context.textBaseline = "bottom";
    for (let slot = 0; slot < count; slot += 1) {
      projected
        .fromArray(positions, slot * 3)
        .multiply(AXES)
        .multiplyScalar(scale)
        .project(camera);
      if (projected.z > 1) continue;
      const x = ((projected.x + 1) / 2) * size.width + NAME_OFFSET;
      const y = ((1 - projected.y) / 2) * size.height - NAME_OFFSET;
      const name = skeleton.joints[slot].name;
      const width = context.measureText(name).width;
      context.fillStyle = ink.plate;
      context.fillRect(x - NAME_PAD, y - lineHeight, width + NAME_PAD * 2, lineHeight);
      context.fillStyle = weighed === null || weighed[slot] ? ink.lit : ink.dim;
      context.fillText(name, x, y);
    }
  });

  return (
    <group scale={[AXIS_SIGN[0] * scale, AXIS_SIGN[1] * scale, AXIS_SIGN[2] * scale]}>
      <primitive object={drawn.segments} />
      <primitive object={drawn.dots} />
    </group>
  );
}

/** The mirrored axis of world.ts as a vector, which the names cross as the group does. */
const AXES = new Vector3(AXIS_SIGN[0], AXIS_SIGN[1], AXIS_SIGN[2]);

/** A scene colour, which is linear, as the CSS a 2D context paints. */
function css(color: Color): string {
  return `#${color.clone().convertLinearToSRGB().getHexString()}`;
}

/** The plate's fill, read off the root as the scene reads its own tokens (DS-TOKEN). */
function plateFill(): string {
  const fill = getComputedStyle(document.documentElement).getPropertyValue(NAME_PLATE_TOKEN).trim();
  return fill === "" ? "transparent" : fill;
}
