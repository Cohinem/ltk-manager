import { useFrame, useThree } from "@react-three/fiber";
import { type ReactNode, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  Bone,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  type Material,
  Matrix4,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Raycaster,
  Skeleton,
  SkinnedMesh,
  type Texture,
  Uint16BufferAttribute,
  Vector2,
} from "three";

import { LOCAL_FLOATS, type Pose } from "../../animation/evaluation/pose";
import type { SceneClock } from "../../animation/state/clock";
import { drawnRanges, type MeshGeometry, type MeshRange } from "../../assets/parsing/meshBuffer";
import type { SkeletonModel } from "../../assets/parsing/skeletonBuffer";
import { AXIS_SIGN } from "../../scene/utils/world";
import { type CharacterSkin, CharacterSkinContext } from "../state/characterSkin";
import { tintFloats, vertexTints } from "../utils/jointTint";
import {
  type FallbackColors,
  applyBinding,
  lit,
  type SubmeshBinding,
  type SubmeshMaterial,
} from "../utils/submeshBinding";

export interface CharacterProps {
  readonly mesh: MeshGeometry;
  readonly pose: Pose;
  /** The time the pose is sampled at, which whoever owns the scene advances. */
  readonly clock: SceneClock;
  /** What a submesh draws with, by its name. */
  readonly bindingOf: (submesh: string) => SubmeshBinding;
  /** What a submesh no texture or no material reaches is drawn in. */
  readonly colors: FallbackColors;
  /** The submeshes the character is drawn without, matched without regard to case. */
  readonly hidden: readonly string[];
  /** `skinScale`, which the whole character is drawn at. */
  readonly scale: number;
  /** The submesh drawn at full strength while every other one dims, and null to dim none. */
  readonly highlighted?: string | null;
  /** A mask's weight per joint slot, which dims every vertex it does not weigh, and null to dim none. */
  readonly jointWeights?: ArrayLike<number> | null;
  /** A click on the viewport, with the submesh it landed on and null where it missed them all. */
  readonly onSubmeshPick?: (submesh: string | null) => void;
  /** What the character wears, which reaches its skin through `useCharacterSkin`. */
  readonly children?: ReactNode;
}

/** How much of its colour a submesh keeps while another one is highlighted. */
const DIMMED = 0.3;

/** How far a press may travel, in pixels, and still read as a click rather than a camera drag. */
const CLICK_SLOP = 4;

/**
 * One skinned mesh on its skeleton, posed at the clock's time.
 *
 * The bones stand in the skeleton's influence order, so a vertex's skin index names its
 * bone as the `.skn` wrote it and no index is rewritten (ADR-0035). The files hold the
 * engine's space, as a particle pool does, so the character crosses the mirrored axis of
 * world.ts as the pool's particles do.
 */
export function Character({
  mesh,
  pose,
  clock,
  bindingOf,
  colors,
  hidden,
  scale,
  highlighted = null,
  jointWeights = null,
  onSubmeshPick,
  children,
}: CharacterProps) {
  const { skeleton, parents } = pose;
  const rig = useMemo(() => buildRig(skeleton, parents), [skeleton, parents]);
  const drawn = useMemo(() => buildGeometry(mesh, rig), [mesh, rig]);
  const skin = useMemo<CharacterSkin>(
    () => ({ geometry: drawn.geometry, skeleton: rig.skeleton, ranges: drawn.ranges, hidden }),
    [drawn, rig, hidden],
  );
  const shaded = useMemo<readonly ShadingModels[]>(
    () =>
      drawn.ranges.map(() => ({
        lit: new MeshLambertMaterial({ side: DoubleSide, vertexColors: true }),
        unlit: new MeshBasicMaterial({ side: DoubleSide, vertexColors: true }),
      })),
    [drawn],
  );
  const skinned = useMemo(() => {
    const bound: Material[] = shaded.map((models) => models.lit);
    const held = new SkinnedMesh(drawn.geometry, bound);
    /* The bounds are the bind pose's, which an animated pose leaves. */
    held.frustumCulled = false;
    /* An identity bind keeps the inverse bind matrices the skeleton carries, where no
       matrix at all would have three compute its own from the pose it stands in. */
    held.bind(rig.skeleton, new Matrix4());
    return held;
  }, [drawn, shaded, rig]);

  /* The bones move onto the mesh here rather than in its memo, because a memo React runs
     twice would move them onto the copy it throws away. */
  useLayoutEffect(() => {
    skinned.add(...rig.roots);
    return () => {
      skinned.remove(...rig.roots);
    };
  }, [skinned, rig]);

  const scrolling = useRef<readonly Scrolling[]>([]);
  useLayoutEffect(() => {
    scrolling.current = bind(skinned, shaded, drawn.ranges, {
      bindingOf,
      colors,
      hidden,
      highlighted,
    });
  }, [skinned, shaded, drawn, bindingOf, colors, hidden, highlighted]);
  useSubmeshPick(skinned, drawn.ranges, hidden, onSubmeshPick);

  useLayoutEffect(() => {
    const color = drawn.geometry.getAttribute("color");
    vertexTints(
      drawn.geometry.getAttribute("skinIndex").array,
      drawn.geometry.getAttribute("skinWeight").array,
      skeleton.influences,
      jointWeights,
      color.array as Float32Array,
    );
    color.needsUpdate = true;
  }, [drawn, skeleton, jointWeights]);

  useEffect(() => () => drawn.geometry.dispose(), [drawn]);
  useEffect(
    () => () => {
      for (const models of shaded) {
        models.lit.dispose();
        models.unlit.dispose();
      }
    },
    [shaded],
  );
  useEffect(() => () => rig.skeleton.dispose(), [rig]);

  const locals = useMemo(() => new Float32Array(rig.bones.length * LOCAL_FLOATS), [rig]);
  useFrame((_, delta) => {
    pose.localsInto(clock.time, locals);
    rig.bones.forEach((bone, slot) => {
      const at = slot * LOCAL_FLOATS;
      bone.position.fromArray(locals, at);
      bone.quaternion.fromArray(locals, at + 3);
      bone.scale.fromArray(locals, at + 7);
    });
    for (const { map, scroll } of scrolling.current) {
      map.offset.x += scroll[0] * delta;
      map.offset.y += scroll[1] * delta;
    }
  });

  return (
    <>
      <primitive
        object={skinned}
        scale={[AXIS_SIGN[0] * scale, AXIS_SIGN[1] * scale, AXIS_SIGN[2] * scale]}
      />
      <CharacterSkinContext value={skin}>{children}</CharacterSkinContext>
    </>
  );
}

/** Every joint as a bone under its parent, and the skeleton the skin binds to. */
interface Rig {
  readonly bones: readonly Bone[];
  readonly roots: readonly Bone[];
  readonly skeleton: Skeleton;
}

function buildRig(skeleton: SkeletonModel, parents: Int32Array): Rig {
  const { joints, influences } = skeleton;
  const bones = joints.map((joint) => {
    const bone = new Bone();
    bone.name = joint.name;
    bone.position.fromArray(joint.translation);
    bone.quaternion.fromArray(joint.rotation);
    bone.scale.fromArray(joint.scale);
    return bone;
  });

  const roots: Bone[] = [];
  parents.forEach((parent, slot) => {
    if (parent < 0) roots.push(bones[slot]);
    else bones[parent].add(bones[slot]);
  });

  const bound = new Skeleton(
    Array.from(influences, (slot) => bones[slot]),
    Array.from(influences, (slot) => new Matrix4().fromArray(joints[slot].inverseBind)),
  );
  return { bones, roots, skeleton: bound };
}

/** What a submesh's material is bound from. */
interface Bind {
  readonly bindingOf: (submesh: string) => SubmeshBinding;
  readonly colors: FallbackColors;
  readonly hidden: readonly string[];
  readonly highlighted: string | null;
}

/** One material per shading model a submesh may draw under, kept for its lifetime. */
interface ShadingModels {
  readonly lit: MeshLambertMaterial;
  readonly unlit: MeshBasicMaterial;
}

/** A map the frame advances, in tiles per second. */
interface Scrolling {
  readonly map: Texture;
  readonly scroll: readonly [number, number];
}

/**
 * Each submesh bound to its material under the shading model the binding calls for, and
 * to none where the skin hides it. Every submesh but a highlighted one dims. Answers the
 * maps that scroll.
 */
function bind(
  skinned: SkinnedMesh,
  shaded: readonly ShadingModels[],
  ranges: readonly MeshRange[],
  { bindingOf, colors, hidden, highlighted }: Bind,
): readonly Scrolling[] {
  const skip = new Set(hidden.map((name) => name.toLowerCase()));
  const picked = highlighted?.toLowerCase() ?? null;
  const scrolling: Scrolling[] = [];
  const bound = skinned.material as Material[];
  ranges.forEach((range, at) => {
    const binding = bindingOf(range.name);
    const material: SubmeshMaterial = lit(binding) ? shaded[at].lit : shaded[at].unlit;
    bound[at] = material;
    material.visible = !skip.has(range.name.toLowerCase());
    const scroll = applyBinding(material, binding, colors);
    if (scroll !== null && material.map !== null) scrolling.push({ map: material.map, scroll });
    if (picked !== null && range.name.toLowerCase() !== picked) {
      material.color.multiplyScalar(DIMMED);
    }
  });
  return scrolling;
}

/**
 * Report which submesh a click on the canvas lands on.
 *
 * The ray is cast on the click alone rather than through the renderer's pointer events,
 * which would skin every vertex of the character on each move of the pointer.
 */
function useSubmeshPick(
  target: SkinnedMesh,
  ranges: readonly MeshRange[],
  hidden: readonly string[],
  onPick: ((submesh: string | null) => void) | undefined,
): void {
  const element = useThree((state) => state.gl.domElement);
  const camera = useThree((state) => state.camera);

  useEffect(() => {
    if (onPick === undefined) return;
    const skip = new Set(hidden.map((name) => name.toLowerCase()));
    const raycaster = new Raycaster();
    const pointer = new Vector2();
    let pressed: { x: number; y: number } | null = null;

    const press = (event: PointerEvent) => {
      pressed = event.button === 0 ? { x: event.clientX, y: event.clientY } : null;
    };
    const release = (event: PointerEvent) => {
      if (pressed === null) return;
      const moved = Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y);
      pressed = null;
      if (moved > CLICK_SLOP) return;

      const box = element.getBoundingClientRect();
      pointer.set(
        ((event.clientX - box.left) / box.width) * 2 - 1,
        -((event.clientY - box.top) / box.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObject(target, false).find((each) => {
        const range = ranges[each.face?.materialIndex ?? -1];
        return range !== undefined && !skip.has(range.name.toLowerCase());
      });
      onPick(hit === undefined ? null : (ranges[hit.face?.materialIndex ?? -1]?.name ?? null));
    };

    element.addEventListener("pointerdown", press);
    element.addEventListener("pointerup", release);
    return () => {
      element.removeEventListener("pointerdown", press);
      element.removeEventListener("pointerup", release);
    };
  }, [element, camera, target, ranges, hidden, onPick]);
}

/**
 * The mesh's buffers, with one draw group per submesh.
 *
 * A hidden submesh keeps its group, so an attached mesh sharing the geometry can draw one
 * the character is drawn without.
 */
interface Drawn {
  readonly geometry: BufferGeometry;
  readonly ranges: readonly MeshRange[];
}

function buildGeometry(mesh: MeshGeometry, rig: Rig): Drawn {
  const geometry = new BufferGeometry();
  const vertices = mesh.positions.length / 3;
  geometry.setAttribute("position", new BufferAttribute(mesh.positions, 3));
  if (mesh.uvs !== null) geometry.setAttribute("uv", new BufferAttribute(mesh.uvs, 2));
  if (mesh.normals !== null) geometry.setAttribute("normal", new BufferAttribute(mesh.normals, 3));
  /* A lit material with no normals draws black, so a mesh without them gets flat ones. */
  else geometry.computeVertexNormals();
  geometry.setAttribute("skinIndex", new Uint16BufferAttribute(skinIndices(mesh, rig), 4));
  geometry.setAttribute(
    "skinWeight",
    new BufferAttribute(mesh.skinWeights ?? boundToFirst(vertices), 4),
  );
  geometry.setIndex(new BufferAttribute(mesh.indices, 1));
  /* Full colour until a mask weighs the joints, which the character's effect writes. */
  geometry.setAttribute(
    "color",
    new BufferAttribute(new Float32Array(tintFloats(vertices)).fill(1), 3),
  );

  const ranges = drawnRanges(mesh, []);
  ranges.forEach((range, at) => geometry.addGroup(range.startIndex, range.indexCount, at));

  return { geometry, ranges };
}

/**
 * Each vertex's shader joints, with any past the skeleton's influences on the first.
 *
 * A skin index past the table reads a bone texture row nothing wrote.
 */
function skinIndices(mesh: MeshGeometry, rig: Rig): Uint16Array {
  const count = rig.skeleton.bones.length;
  const held = new Uint16Array(mesh.skinIndices ?? new Uint8Array((mesh.positions.length / 3) * 4));
  for (let at = 0; at < held.length; at += 1) {
    if (held[at] >= count) held[at] = 0;
  }
  return held;
}

/** Weights binding every vertex wholly to its first shader joint. */
function boundToFirst(vertices: number): Float32Array {
  const weights = new Float32Array(vertices * 4);
  for (let vertex = 0; vertex < vertices; vertex += 1) weights[vertex * 4] = 1;
  return weights;
}
