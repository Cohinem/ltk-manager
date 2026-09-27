import type { Color } from "three";

import { useTokenColor } from "@/modules/viewport";

import { ShapeOverlay } from "../../drivers/components/ShapeOverlay";
import { useHoveredEmitter } from "../../drivers/state/hoveredEmitter";
import type { EmitterModel, SystemModel } from "../../engine/model/model";
import type { Driver } from "../../engine/simulation/driver";
import { EmitterGizmo } from "../../rendering/components/EmitterGizmo";

/* DS-TOKEN: the hovered emitter reads over the gizmo's accent, a near white. */
const HOVER_TOKEN = "--color-surface-50";

/**
 * The emitter marks the viewport draws over the run: the chosen emitter's gizmo while it is
 * on, and the emitter under the pointer in the Graph pane.
 *
 * Each is the emitter's origin and offset as lines and its spawn shape as a body, placed
 * through the frame a birth is placed through.
 */
export function EmitterMarks({
  system,
  driver,
  opened,
  gizmo,
}: {
  system: SystemModel;
  driver: Driver;
  /** The emitter the inspector has open, and null for none or a child. */
  opened: EmitterModel | null;
  gizmo: boolean;
}) {
  const hoveredKey = useHoveredEmitter();
  const hoverColor = useTokenColor(HOVER_TOKEN);
  const hovered =
    hoveredKey === null || system.entry?.toLowerCase() !== hoveredKey.entry.toLowerCase()
      ? undefined
      : system.emitters.find(
          (each) => each.simple === hoveredKey.simple && each.listIndex === hoveredKey.listIndex,
        );

  return (
    <>
      {gizmo && opened !== null && <Mark system={system} driver={driver} emitter={opened} />}
      {hovered !== undefined && (
        <Mark system={system} driver={driver} emitter={hovered} color={hoverColor} />
      )}
    </>
  );
}

function Mark({
  system,
  driver,
  emitter,
  color,
}: {
  system: SystemModel;
  driver: Driver;
  emitter: EmitterModel;
  color?: Color;
}) {
  return (
    <>
      <EmitterGizmo system={system} driver={driver} emitter={emitter} color={color} />
      <ShapeOverlay system={system} driver={driver} emitter={emitter} color={color} />
    </>
  );
}
