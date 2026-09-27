import { useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";

import { isClick, type ScreenPoint } from "@/modules/viewport";

import type { SystemModel } from "../../engine/model/model";
import type { PickRegistry } from "../../rendering/state/pick";
import { createPicker } from "../../rendering/utils/pickRender";
import { useLaneSelect } from "../../timeline/hooks/useLaneSelect";
import { drawnLane } from "../../timeline/utils/selection";
import type { GrabLatch } from "../utils/grabLatch";

interface ViewportPickProps {
  readonly picks: PickRegistry;
  readonly system: SystemModel;
  /** Marks a press a gizmo took, whose release is the gizmo's rather than a pick. */
  readonly latch: GrabLatch;
}

/**
 * A click on a drawn particle selects its emitter's lane, "The viewer" in docs/ux/BIN_EDITOR.md.
 *
 * The pick draws on a click alone and adds nothing to a frame. A press that travels past the
 * click slop is the camera's drag, and one a gizmo marked is the gizmo's.
 */
export function ViewportPick({ picks, system, latch }: ViewportPickProps) {
  /* The element the fibre listens on. Every viewport sharing a renderer draws into its canvas. */
  const element = useThree(
    (state) => (state.events.connected as HTMLElement | undefined) ?? state.gl.domElement,
  );
  const get = useThree((state) => state.get);
  const select = useLaneSelect();
  const picker = useMemo(createPicker, []);
  useEffect(() => () => picker.dispose(), [picker]);

  const latest = useRef({ system, select });
  useLayoutEffect(() => {
    latest.current = { system, select };
  });

  useEffect(() => {
    let pressed: ScreenPoint | null = null;

    const press = (event: PointerEvent) => {
      pressed = event.button === 0 ? { x: event.clientX, y: event.clientY } : null;
    };
    const release = (event: PointerEvent) => {
      const from = pressed;
      pressed = null;
      const grabbed = latch.take();
      if (from === null || grabbed) return;
      if (!isClick(from, { x: event.clientX, y: event.clientY })) return;

      const box = element.getBoundingClientRect();
      const { gl, camera } = get();
      const hit = picker.pick(gl, camera, picks.entries(), {
        x: event.clientX - box.left,
        y: event.clientY - box.top,
        width: box.width,
        height: box.height,
      });
      if (hit === null) return;

      const lane = drawnLane(latest.current.system, hit.owner);
      if (lane !== null) latest.current.select(lane);
    };

    element.addEventListener("pointerdown", press);
    element.addEventListener("pointerup", release);
    return () => {
      element.removeEventListener("pointerdown", press);
      element.removeEventListener("pointerup", release);
    };
  }, [element, get, picker, picks, latch]);

  return null;
}
