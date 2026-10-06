import type { Color } from "three";

import { useTokenColor } from "@/modules/viewport";

import { ShapeOverlay } from "../../drivers/components/ShapeOverlay";
import { useHoveredEmitter } from "../../drivers/state/hoveredEmitter";
import type { EmitterModel, SystemModel } from "../../engine/model/model";
import type { Driver } from "../../engine/simulation/driver";
import { EmitterGizmo } from "../../rendering/components/EmitterGizmo";
import { SourceCloud } from "../../rendering/components/SourceCloud";
import { useHandlePreview } from "../state/handlePreview";
import { handleBlock, handleMark, type SpatialKind } from "../utils/spatialHandles";

/* DS-TOKEN: the hovered emitter reads over the gizmo's accent, a near white. */
const HOVER_TOKEN = "--color-surface-50";

/**
 * The emitter marks the viewport draws over the run: the chosen emitter's gizmo while it is
 * on, and the emitter under the pointer in the Graph pane.
 *
 * Each mark draws the emitter's origin and offset as lines, its spawn shape as a body, and
 * births sampled from its emission mesh and surface as points. All are placed with the frame
 * a birth is placed with.
 *
 * With the gizmo off, a chosen handle still draws the part it edits, per "The handle menu" in
 * docs/ux/BIN_EDITOR.md. The chosen emitter's marks follow a handle drag.
 */
export function EmitterMarks({
  system,
  driver,
  opened,
  gizmo,
  handle,
}: {
  system: SystemModel;
  driver: Driver;
  /** The emitter the inspector has open, and null for none or a child. */
  opened: EmitterModel | null;
  gizmo: boolean;
  /** The handle a drag can edit the open emitter with, and null for none. */
  handle: SpatialKind | null;
}) {
  const hoveredKey = useHoveredEmitter();
  const hoverColor = useTokenColor(HOVER_TOKEN);
  const previewed = useHandlePreview(system);
  const hovered =
    hoveredKey === null || system.entry?.toLowerCase() !== hoveredKey.entry.toLowerCase()
      ? undefined
      : system.emitters.find(
          (each) => each.simple === hoveredKey.simple && each.listIndex === hoveredKey.listIndex,
        );

  const chosen = previewed !== null && previewed.index === opened?.index ? previewed : opened;
  const edited =
    gizmo || handle === null || opened === null || handleBlock(handle, opened) !== null
      ? null
      : handleMark(handle);

  return (
    <>
      {gizmo && chosen !== null && <Mark system={system} driver={driver} emitter={chosen} />}
      {edited === "shape" && chosen !== null && (
        <ShapeOverlay system={system} driver={driver} emitter={chosen} />
      )}
      {edited === "source" && chosen !== null && (
        <SourceCloud system={system} driver={driver} emitter={chosen} />
      )}
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
      {(emitter.emissionMesh !== null || emitter.emissionSurface !== null) && (
        <SourceCloud system={system} driver={driver} emitter={emitter} color={color} />
      )}
    </>
  );
}
