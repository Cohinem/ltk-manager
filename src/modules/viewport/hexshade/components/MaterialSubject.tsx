import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Matrix4, Mesh, MeshBasicMaterial, SkinnedMesh } from "three";

import { useSceneColors } from "../../scene/hooks/sceneColors";
import { AXIS_SIGN } from "../../shared/utils/space";
import { EngineEnvironment } from "../engineEnvironment";
import { type PreviewShape, previewGeometry, previewSkeleton } from "../previewMeshes";
import type { SubmeshProgram } from "../programMaterial";
import { type HeldValue, ProgramMaterials } from "../programMaterials";

/** How fast the turntable turns, in radians per second. */
const TURN_RATE = 0.5;

export interface MaterialSubjectProps {
  /** The pass the shape draws with, and null for the error material. */
  readonly program: SubmeshProgram | null;
  /** The program reads its world transform through `BonesCB`, as a skinned mesh's does. */
  readonly skinned: boolean;
  readonly shape: PreviewShape;
  /** The shape turns about the up axis. */
  readonly turntable: boolean;
  /** A value a control holds, drawn in place of the program's own until it is let go. */
  readonly held?: HeldValue | null;
}

/**
 * One preview shape drawn with a translated program, under its own engine environment.
 *
 * A skinned program draws on a `SkinnedMesh` bound wholly to one bone at the origin,
 * since it takes its world transform from the bones and would collapse on a plain mesh.
 * The shape is stored in the engine's space and mirrored by `AXIS_SIGN` the way a
 * character is, so the pass state and the sun read as they do on a character. A pass that
 * did not translate draws in the scene's error colour.
 */
export function MaterialSubject({
  program,
  skinned,
  shape,
  turntable,
  held = null,
}: MaterialSubjectProps) {
  const colors = useSceneColors();
  const environment = useMemo(() => new EngineEnvironment(), []);
  const geometry = useMemo(() => previewGeometry(shape, skinned), [shape, skinned]);
  const errored = useMemo(() => new MeshBasicMaterial({ color: colors.errored }), [colors.errored]);
  const time = useRef(0);

  const mesh = useMemo(() => {
    const made = skinned ? new SkinnedMesh(geometry, errored) : new Mesh(geometry, errored);
    made.scale.set(...AXIS_SIGN);
    made.frustumCulled = false;

    if (made instanceof SkinnedMesh) {
      const skeleton = previewSkeleton();
      made.add(...skeleton.bones);
      made.bind(skeleton, new Matrix4());
    }

    made.onBeforeRender = (renderer, _scene, camera, _geometry, material) => {
      environment.write(renderer, camera, made, time.current);
      environment.draw(material);
    };
    return made;
  }, [geometry, skinned, errored, environment]);

  const materials = useMemo(() => new ProgramMaterials(environment), [environment]);
  useLayoutEffect(() => {
    if (program === null) {
      mesh.material = errored;
      materials.retain(new Set());
      return;
    }

    const material = materials.acquire(program);
    mesh.material = material;
    materials.retain(new Set([material]));
  }, [program, mesh, errored, materials]);
  useLayoutEffect(() => materials.hold(held), [materials, held]);

  useFrame((state, delta) => {
    time.current = state.clock.elapsedTime;
    if (turntable) mesh.rotation.y += delta * TURN_RATE;
  });

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => errored.dispose(), [errored]);
  useEffect(() => {
    if (mesh instanceof SkinnedMesh) return () => mesh.skeleton.dispose();
  }, [mesh]);
  useEffect(
    () => () => {
      materials.dispose();
      environment.dispose();
    },
    [materials, environment],
  );

  return <primitive object={mesh} />;
}
