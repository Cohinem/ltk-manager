import { createContext, type RefObject, use, useEffect } from "react";
import type { Object3D, ShaderMaterial } from "three";

import type { DrawnEmitter } from "../utils/definitions";

/** One object a draw path mounts, as a pick redraws it. */
export interface PickTarget {
  /** The object the frame draws, whose buffers the pick reads as they were last written. */
  readonly solid: RefObject<Object3D | null>;
  /** The solid's edge twin, which draws alone where the wireframe mode hides the solid. */
  readonly twin: RefObject<Object3D | null>;
  /** The hand-written material whose vertex program places the solid's vertices. */
  readonly material: ShaderMaterial;
}

/** A target, and the emitter whose particles it draws. */
export interface PickEntry extends PickTarget {
  readonly owner: DrawnEmitter;
}

/** Every target one view's emitters draw, which a click in that view is resolved against. */
export interface PickRegistry {
  /** Register `entry` until the returned call releases it. */
  readonly add: (entry: PickEntry) => () => void;
  readonly entries: () => readonly PickEntry[];
}

/** An empty registry. */
export function createPickRegistry(): PickRegistry {
  const listed = new Set<PickEntry>();

  return {
    add: (entry) => {
      listed.add(entry);
      return () => {
        listed.delete(entry);
      };
    },
    entries: () => [...listed],
  };
}

/** The registry one draw path's targets join, and the emitter they draw. */
export interface PickScope {
  readonly registry: PickRegistry;
  readonly owner: DrawnEmitter;
}

/** The scope a draw path registers under, and null in a view that picks nothing. */
export const PickScopeContext = createContext<PickScope | null>(null);

/** Register `targets` in the draw path's scope while they are mounted. */
export function usePickTargets(targets: readonly PickTarget[]): void {
  const scope = use(PickScopeContext);

  useEffect(() => {
    if (scope === null) return;

    const releases = targets.map((target) => scope.registry.add({ ...target, owner: scope.owner }));
    return () => {
      for (const release of releases) release();
    };
  }, [scope, targets]);
}
