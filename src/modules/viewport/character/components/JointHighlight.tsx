import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo } from "react";
import {
  BufferAttribute,
  BufferGeometry,
  LineBasicMaterial,
  LineSegments,
  Points,
  PointsMaterial,
} from "three";

import type { Pose } from "../../animation/evaluation/pose";
import type { SceneClock } from "../../animation/state/clock";
import type { SceneColors } from "../../scene/hooks/sceneColors";
import { AXIS_SIGN } from "../../scene/utils/world";
import { boneSegments, subtreeOf } from "../utils/armatureModel";
import { OVER_EVERYTHING } from "../utils/overlayMaterial";

/** The selected joint's dot, in pixels at any distance. */
const SELECTED_PX = 11;

/** The highlight draws over the character, its armature and the dynamics overlay. */
const OVER_THE_OVERLAYS = 20;

export interface JointHighlightProps {
  readonly pose: Pose;
  readonly clock: SceneClock;
  /** `skinScale`, which the character is drawn at. */
  readonly scale: number;
  readonly colors: SceneColors;
  /** The joint a reader selected, by slot. */
  readonly joint: number;
}

/**
 * One joint marked over the character, with the bones of every joint under it.
 *
 * "The skeleton pane" in docs/ux/SKIN_EDITOR.md.
 */
export function JointHighlight({ pose, clock, scale, colors, joint }: JointHighlightProps) {
  const bones = useMemo(() => {
    const under = subtreeOf(pose.parents, joint);
    return boneSegments(pose.parents).filter(([, parent]) => under[parent]);
  }, [pose.parents, joint]);

  const drawn = useMemo(() => {
    const dot = new BufferGeometry();
    dot.setAttribute("position", new BufferAttribute(new Float32Array(3), 3));
    const lines = new BufferGeometry();
    lines.setAttribute("position", new BufferAttribute(new Float32Array(bones.length * 6), 3));

    const mark = new Points(
      dot,
      new PointsMaterial({
        size: SELECTED_PX,
        sizeAttenuation: false,
        ...OVER_EVERYTHING,
      }),
    );
    const segments = new LineSegments(lines, new LineBasicMaterial(OVER_EVERYTHING));
    for (const object of [segments, mark]) {
      object.frustumCulled = false;
      object.renderOrder = OVER_THE_OVERLAYS;
    }
    mark.renderOrder += 1;
    return { mark, segments };
  }, [bones]);

  useEffect(
    () => () => {
      for (const object of [drawn.mark, drawn.segments]) {
        object.geometry.dispose();
        object.material.dispose();
      }
    },
    [drawn],
  );

  useLayoutEffect(() => {
    drawn.mark.material.color.copy(colors.ink);
    drawn.segments.material.color.copy(colors.ink);
  }, [drawn, colors]);

  const world = useMemo(() => new Float32Array(16), []);

  useFrame(() => {
    const time = clock.time;

    const mark = drawn.mark.geometry.getAttribute("position");
    standInto(mark.array, 0, pose.worldInto(joint, time, world));
    mark.needsUpdate = true;

    const ends = drawn.segments.geometry.getAttribute("position");
    for (let bone = 0; bone < bones.length; bone += 1) {
      standInto(ends.array, bone * 6, pose.worldInto(bones[bone][0], time, world));
      standInto(ends.array, bone * 6 + 3, pose.worldInto(bones[bone][1], time, world));
    }
    ends.needsUpdate = true;
  });

  return (
    <group scale={[AXIS_SIGN[0] * scale, AXIS_SIGN[1] * scale, AXIS_SIGN[2] * scale]}>
      <primitive object={drawn.segments} />
      <primitive object={drawn.mark} />
    </group>
  );
}

/** Where the column-major matrix `world` stands, into `out` at float `at`. */
function standInto(out: { [index: number]: number }, at: number, world: Float32Array): void {
  out[at] = world[12];
  out[at + 1] = world[13];
  out[at + 2] = world[14];
}
