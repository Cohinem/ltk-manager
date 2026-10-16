import type { Ref } from "react";
import { type Color, DoubleSide, type Group, type Matrix4 } from "three";

import { useSceneColors } from "@/modules/viewport";

import type { ShapeBody } from "../utils/shapeBody";

/** How much of the gizmo's colour a body's faces take, faint enough to read the scene through. */
const FACE_OPACITY = 0.08;

/** The edges' opacity over the faces. */
const EDGE_OPACITY = 0.85;

/** The opacity of a legacy shape's secondary sweep rings. */
const SWEEP_OPACITY = 0.2;

/** The emit rotations' axes and arcs, drawn over the body in the wireframe's lighter accent. */
const TURN_OPACITY = 0.9;

/** How far a stand-in body, a shape of no size drawn at a unit size, is dimmed. */
const STAND_IN = 0.4;

/**
 * A spawn shape's body as an analytic figure: faint faces in the gizmo's colour under crisp
 * edges, and a legacy shape's emit rotation axes over them, placed by `matrix`,
 * which the caller keeps current. The faces write no depth, so particles and the far side of
 * the body show through.
 */
export function SpawnBody({
  body,
  matrix,
  standIn = false,
  color,
  ref,
}: {
  body: ShapeBody;
  matrix?: Matrix4;
  /** The body stands in for a shape of no size, so it draws dimmer. */
  standIn?: boolean;
  /** The faces' and edges' colour, the gizmo's where unset. */
  color?: Color;
  ref?: Ref<Group>;
}) {
  const colors = useSceneColors();
  const tone = color ?? colors.gizmo;
  const dim = standIn ? STAND_IN : 1;

  return (
    <group ref={ref} matrixAutoUpdate={false} matrix={matrix}>
      {body.faces !== null && (
        <mesh geometry={body.faces} frustumCulled={false}>
          <meshBasicMaterial
            color={tone}
            transparent
            opacity={FACE_OPACITY * dim}
            depthWrite={false}
            side={DoubleSide}
          />
        </mesh>
      )}
      <lineSegments geometry={body.edges} frustumCulled={false}>
        <lineBasicMaterial color={tone} transparent opacity={EDGE_OPACITY * dim} />
      </lineSegments>
      {body.sweep !== null && (
        <lineSegments geometry={body.sweep} frustumCulled={false}>
          <lineBasicMaterial color={tone} transparent opacity={SWEEP_OPACITY * dim} />
        </lineSegments>
      )}
      {body.turns !== null && (
        <lineSegments geometry={body.turns} frustumCulled={false}>
          <lineBasicMaterial color={colors.wire} transparent opacity={TURN_OPACITY} />
        </lineSegments>
      )}
    </group>
  );
}
