import { CubeTransparentIcon } from "@phosphor-icons/react";
import { useFrame } from "@react-three/fiber";
import { use, useEffect, useMemo, useRef } from "react";
import type { Color, Group } from "three";

import { IconButton } from "@/components";
import { m } from "@/i18n";
import { usePreviewGizmo, useSetPreviewDisplay } from "@/stores";

import type { EmitterModel, SystemModel } from "../../engine/model/model";
import type { Driver } from "../../engine/simulation/driver";
import { worldOf } from "../../engine/simulation/integrate";
import { frameOf } from "../../engine/simulation/particleRead";
import { FRAME_SLOTS } from "../../engine/simulation/pool";
import { sampleCurveInto } from "../../engine/utils/sampleCurve";
import { useEmitters } from "../../inspector/state/emitterChoice";
import { VfxRunContext } from "../../playback/state/run";
import { spawnFrameInto } from "../../rendering/utils/emitterShape";
import { emitterOf } from "../utils/graphEmitter";
import { bodyMatrixInto, shapeBody } from "../utils/shapeBody";
import { spawnCloud } from "../utils/spawnCloud";
import { SpawnBody } from "./SpawnBody";

/**
 * The spawn shape of `emitter` in the preview viewport, as the Spawn Shape node draws it: its
 * body in faint faces under crisp edges, placed every frame through the frame a birth is
 * placed through, so it rides the rig and the emitter's position. A point has no body and
 * draws nothing, the emitter's gizmo lines standing for it.
 */
export function ShapeOverlay({
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
  const body = useMemo(() => shapeBody(emitter.shape, spawnCloud(emitter)), [emitter]);
  const world = useMemo(() => worldOf(system), [system]);
  const group = useRef<Group>(null);
  useEffect(
    () => () => {
      body?.faces.dispose();
      body?.edges.dispose();
      body?.turns?.dispose();
    },
    [body],
  );

  useFrame(() => {
    const placed = group.current;
    if (placed === null) return;

    const frame = frameOf(driver, emitter);
    spawnFrameInto(emitter, world.basis, frame.orientation, FRAME);
    STANDS.fill(0);
    sampleCurveInto(emitter.emitterPosition, frame.phase, STANDS, 0);
    for (let axis = 0; axis < 3; axis += 1) {
      OFFSET[axis] = STANDS[axis]! + emitter.translationOverride[axis]!;
    }
    bodyMatrixInto(FRAME, frame.origin, OFFSET, placed.matrix);
    placed.matrixWorldNeedsUpdate = true;
  });

  if (body === null) return null;
  return <SpawnBody ref={group} body={body} color={color} />;
}

/** The frame a birth is placed in, which `integrate.ts` calls the emitter's spawn frame. */
const FRAME = new Float32Array(FRAME_SLOTS);

/** Where `EmitterPosition` has the emitter this frame. */
const STANDS = new Float32Array(3);
const OFFSET: [number, number, number] = [0, 0, 0];

/**
 * The Spawn Shape node's switch that shows its emitter's gizmo in the preview viewport.
 *
 * It opens the emitter and turns the gizmo on, which draws the chosen emitter's shape and its
 * handles, so the node and the viewport share one gizmo. Pressed while the gizmo shows this
 * emitter, and a press then turns the gizmo off.
 */
export function ShapeInViewButton({ id }: { id: string }) {
  const system = use(VfxRunContext)?.system ?? null;
  const emitter = useMemo(() => emitterOf(system, id), [system, id]);
  const { cards, card, chooseCard } = useEmitters();
  const gizmo = usePreviewGizmo();
  const setDisplay = useSetPreviewDisplay();
  if (emitter === undefined) return null;

  const own = cards.find(
    (each) => each.simple === emitter.simple && each.index === emitter.listIndex,
  );
  const pressed = gizmo && own !== undefined && card?.key === own.key;
  const label = m.workshop_bin_graph_shape_in_view_action();

  return (
    <IconButton
      compact={false}
      aria-label={label}
      title={label}
      pressed={pressed}
      disabled={own === undefined}
      className="nodrag shrink-0"
      icon={<CubeTransparentIcon className="size-3.5" />}
      onClick={() => {
        if (own === undefined) return;
        if (pressed) {
          setDisplay({ previewGizmo: false });
          return;
        }

        chooseCard(own.key);
        setDisplay({ previewGizmo: true });
      }}
    />
  );
}
