import { TransformControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { type ComponentRef, useEffect, useMemo, useRef, useState } from "react";
import { Group, Matrix4, Vector3 } from "three";

import type { BinRow } from "@/lib/tauri";
import { AXIS_SIGN } from "@/modules/viewport";

import type { LeafEdit } from "../../../tree/hooks/useLeafEdit";
import type { EmitterModel, SystemModel } from "../../engine/model/model";
import type { Point } from "../../engine/model/rig";
import { worldOf } from "../../engine/simulation/integrate";
import { frameOf } from "../../engine/simulation/particleRead";
import { sampleCurveInto } from "../../engine/utils/sampleCurve";
import { useVfxRun } from "../../playback/state/run";
import { spawnFrameInto } from "../../rendering/utils/emitterShape";
import {
  engineRotation,
  rotationFrame,
  translationFrame,
  viewportRotation,
} from "../utils/transformEdit";

export type TransformMode = "translate" | "rotate";

interface Props {
  system: SystemModel;
  emitter: EmitterModel;
  row: BinRow;
  mode: TransformMode;
  edit: LeafEdit;
}

/** A selected emitter's authored override, previewed during a drag and committed on release. */
export function EmitterTransform({ system, emitter, row, mode, edit }: Props) {
  const { driver, playing, setPlaying } = useVfxRun();
  const controls = useThree((state) => state.controls);
  const object = useMemo(() => new Group(), []);
  const transform = useRef<ComponentRef<typeof TransformControls>>(null);
  const [generation, setGeneration] = useState(0);
  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const world = useMemo(() => worldOf(system), [system]);
  const basis = useMemo(() => new Float32Array(9), []);
  const offset = useMemo(() => new Float32Array(3), []);
  const placement = useRef(new Matrix4());
  const rotation = useRef(new Matrix4());
  const available = useRef(false);
  const cameraEnabled = useRef(true);
  const drag = useRef<{
    time: number;
    playing: boolean;
    cameraEnabled: boolean;
    saving: boolean;
    value: Point | null;
  } | null>(null);

  function edited(value: Point): SystemModel {
    const property = mode === "translate" ? "translationOverride" : "rotationOverride";
    const next = { ...emitter, [property]: value };

    return {
      ...system,
      emitters: system.emitters.map((item) => (item.index === emitter.index ? next : item)),
    };
  }

  function restore(saved?: Point) {
    const held = drag.current;
    if (held === null) {
      return;
    }

    drag.current = null;
    transform.current?.reset();
    setGeneration((held) => held + 1);
    setSaving(false);
    driver.swap(saved === undefined ? system : edited(saved));
    driver.seek(held.time);
    setPlaying(held.playing);
    if (controls !== null && "enabled" in controls) {
      controls.enabled = held.cameraEnabled;
    }
  }

  const restoreRef = useRef(restore);
  restoreRef.current = restore;

  useEffect(() => {
    const cancel = (event: KeyboardEvent) => {
      if (event.key === "Escape" && drag.current !== null && !drag.current.saving) {
        event.stopPropagation();
        restoreRef.current();
      }
    };
    window.addEventListener("keydown", cancel, true);

    return () => {
      window.removeEventListener("keydown", cancel, true);
      restoreRef.current();
    };
  }, [system, emitter.index, mode]);

  useFrame(() => {
    if (drag.current !== null) {
      return;
    }

    if (controls !== null && "enabled" in controls) {
      cameraEnabled.current = Boolean(controls.enabled);
    }

    const frame = frameOf(driver, emitter);
    spawnFrameInto(emitter, world.basis, frame.orientation, basis);
    placement.current = translationFrame(basis, frame.origin);
    offset.fill(0);
    sampleCurveInto(emitter.emitterPosition, frame.phase, offset, 0);

    const parent = rotationFrame(emitter.localOrientation ? frame.orientation : world.basis);
    available.current =
      mode === "translate" ? Math.abs(placement.current.determinant()) > 1e-8 : parent !== null;
    object.visible = available.current;
    if (transform.current !== null) {
      transform.current.visible = available.current;
    }
    setEnabled(available.current);
    if (mode === "translate") {
      object.position
        .set(...emitter.translationOverride)
        .add(new Vector3(...offset))
        .applyMatrix4(placement.current);
      object.quaternion.identity();
    } else if (parent !== null) {
      rotation.current.copy(parent);
      object.position.set(...frame.origin).multiply(new Vector3(...AXIS_SIGN));
      object.quaternion.copy(viewportRotation(parent, emitter.rotationOverride));
    }

    object.updateMatrixWorld();
  });

  function change() {
    const held = drag.current;
    if (held === null) {
      return;
    }

    let value: Point;
    if (mode === "translate") {
      const position = object.position
        .clone()
        .applyMatrix4(placement.current.clone().invert())
        .sub(new Vector3(...offset));
      value = [position.x, position.y, position.z];
    } else {
      value = engineRotation(rotation.current, object.quaternion);
    }

    if (!value.every(Number.isFinite)) {
      return;
    }

    held.value = value;
    driver.swap(edited(value));
    driver.seek(held.time);
  }

  async function finish() {
    const held = drag.current;
    if (held?.saving) {
      return;
    }

    if (held === null || held.value === null) {
      restore();
      return;
    }

    held.saving = true;
    setSaving(true);
    try {
      const saved = await edit.commit(row, {
        ok: true,
        leaf: { type: "vector", values: [...held.value] },
      });
      if (drag.current === held) {
        restore(saved === false ? undefined : held.value);
      }
    } catch {
      if (drag.current === held) {
        restore();
      }
    }
  }

  return (
    <>
      <primitive object={object} />
      <TransformControls
        key={generation}
        ref={transform}
        enabled={enabled && !saving}
        object={object}
        mode={mode}
        space="world"
        onMouseDown={() => {
          if (available.current) {
            drag.current = {
              time: driver.phase,
              playing,
              cameraEnabled: cameraEnabled.current,
              saving: false,
              value: null,
            };
            setPlaying(false);
          }
        }}
        onObjectChange={change}
        onMouseUp={() => {
          void finish();
        }}
      />
    </>
  );
}
