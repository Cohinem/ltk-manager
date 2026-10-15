import { useThree } from "@react-three/fiber";
import { type RefObject, useEffect } from "react";
import type { Object3D, Scene, ShaderMaterial } from "three";

/** One object a draw path mounts that the shadow pass redraws. */
export interface ShadowCaster {
  /** The object the frame draws, whose buffers the pass reads as the emitters wrote them. */
  readonly solid: RefObject<Object3D | null>;
  /** The hand-written material whose vertex program places the solid's vertices. */
  readonly material: ShaderMaterial;
}

const CASTERS = new WeakMap<Scene, Set<ShadowCaster>>();

/** Returns the shadow casters registered in `scene`. */
export function shadowCastersOf(scene: Scene): ReadonlySet<ShadowCaster> {
  return castersIn(scene);
}

function castersIn(scene: Scene): Set<ShadowCaster> {
  const held = CASTERS.get(scene);
  if (held !== undefined) return held;

  const made = new Set<ShadowCaster>();
  CASTERS.set(scene, made);
  return made;
}

/** Registers `casters` in the current scene while they are mounted and `casts` is true. */
export function useShadowCasters(casters: readonly ShadowCaster[], casts: boolean): void {
  const scene = useThree((state) => state.scene);

  useEffect(() => {
    if (!casts) return;

    const listed = castersIn(scene);
    for (const caster of casters) listed.add(caster);
    return () => {
      for (const caster of casters) listed.delete(caster);
    };
  }, [scene, casters, casts]);
}
