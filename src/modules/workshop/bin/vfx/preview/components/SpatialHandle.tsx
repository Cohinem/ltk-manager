import { TransformControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { type ComponentRef, useEffect, useMemo, useRef, useState } from "react";
import {
  type BufferAttribute,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  Matrix4,
  Quaternion,
  Vector3,
} from "three";

import type { BinRow } from "@/lib/tauri";
import { AXIS_SIGN, useSceneColors } from "@/modules/viewport";

import type { LeafEdit } from "../../../tree/hooks/useLeafEdit";
import type { EmitterModel, SystemModel } from "../../engine/model/model";
import type { Point } from "../../engine/model/rig";
import { worldOf } from "../../engine/simulation/integrate";
import { frameOf } from "../../engine/simulation/particleRead";
import { sampleCurveInto } from "../../engine/utils/sampleCurve";
import { useVfxRun } from "../../playback/state/run";
import { spawnFrameInto } from "../../rendering/utils/emitterShape";
import { type FlightPath, flightPath } from "../utils/flightPath";
import {
  handleEdit,
  handleMode,
  handlePoint,
  pointValue,
  scaleValue,
  shapeScale,
  type SpatialKind,
  withHandleValue,
} from "../utils/spatialHandles";
import { rotationFrame, translationFrame, viewportRotation } from "../utils/transformEdit";

interface Props {
  system: SystemModel;
  emitter: EmitterModel;
  /** The emitter's own row, which the edit is written under. */
  holder: BinRow;
  kind: SpatialKind;
  edit: LeafEdit;
  /** Told of each press on a handle, which a viewport pick yields to. */
  onGrab?: () => void;
}

/** What a drag holds from its press to its release. */
interface Drag {
  readonly time: number;
  readonly playing: boolean;
  readonly cameraEnabled: boolean;
  /** Where the emitter stood at the press, which the drag reads its value against. */
  readonly base: Point;
  readonly start: Point;
  saving: boolean;
  value: Point | null;
}

const NO_TURN: Point = [0, 0, 0];

/** The chance a flight draws its random values at while the run pins none. */
const MIDDLE_CHANCE = 0.5;

/** The most points a flight holds, `flightPath`'s steps and its first point. */
const FLIGHT_POINTS = 91;

/** How many even parts of the life the flight's dots mark. */
const TENTHS = 10;

/** A dot's size in pixels. */
const TICK_SIZE = 5;

/** The straight line is what the flight would be with no forces, so it draws faint. */
const STRAIGHT_OPACITY = 0.45;

/**
 * A viewport handle on one of the emitter's spatial values: `EmitterPosition`, the spawn
 * shape's emit offset or size, or the birth velocity.
 *
 * It stands where the value puts the emitter, placed through the frame a birth is placed
 * through. A drag previews through the run and pauses it, Escape cancels, and the release
 * writes the value as one edit.
 *
 * The velocity handle is the tip of a straight line from where a birth starts, as far as the
 * birth velocity alone carries a particle over its life. Beside it runs the path the engine
 * really flies one particle along, acceleration, drag and forces included, with a dot at each
 * tenth of its life, so the spacing reads as its speed. Both follow a drag.
 */
export function SpatialHandle({ system, emitter, holder, kind, edit, onGrab }: Props) {
  const { driver, playing, setPlaying, pinned } = useVfxRun();
  const controls = useThree((state) => state.controls);
  const colors = useSceneColors();
  const object = useMemo(() => new Group(), []);
  const transform = useRef<ComponentRef<typeof TransformControls>>(null);
  const [generation, setGeneration] = useState(0);
  const [saving, setSaving] = useState(false);
  const world = useMemo(() => worldOf(system), [system]);
  const basis = useMemo(() => new Float32Array(9), []);
  const stands = useMemo(() => new Float32Array(3), []);
  const placement = useRef(new Matrix4());
  const base = useRef<Point>([0, 0, 0]);
  const cameraEnabled = useRef(true);
  const drag = useRef<Drag | null>(null);
  const line = useMemo(() => new Float32Array(6), []);
  const lineGeometry = useRef<BufferGeometry>(null);
  const lineAttribute = useRef<BufferAttribute>(null);
  const path = useMemo(() => new Float32Array(FLIGHT_POINTS * 3), []);
  /* A `Line` built here, since `<line>` in JSX is the SVG element to TypeScript. */
  const flownLine = useMemo(() => {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(path, 3));
    const drawn = new Line(geometry, new LineBasicMaterial());
    drawn.frustumCulled = false;
    return drawn;
  }, [path]);
  useEffect(
    () => () => {
      flownLine.geometry.dispose();
      flownLine.material.dispose();
    },
    [flownLine],
  );
  const ticks = useMemo(() => new Float32Array((TENTHS + 1) * 3), []);
  const tickAttribute = useRef<BufferAttribute>(null);
  const mode = handleMode(kind);
  const chance = pinned ?? MIDDLE_CHANCE;
  const flight = useRef<FlightPath | null>(null);
  const seconds = useRef(1);
  useEffect(() => {
    if (kind !== "velocity") return;

    flight.current = flightPath(system, emitter, chance);
    seconds.current = flight.current.life > 0 ? flight.current.life : 1;
  }, [kind, system, emitter, chance]);

  function edited(value: Point): SystemModel {
    const next = withHandleValue(kind, emitter, value);
    return {
      ...system,
      emitters: system.emitters.map((item) => (item.index === emitter.index ? next : item)),
    };
  }

  function restore(saved?: Point) {
    const held = drag.current;
    if (held === null) return;

    drag.current = null;
    transform.current?.reset();
    setGeneration((each) => each + 1);
    setSaving(false);
    driver.swap(saved === undefined ? system : edited(saved));
    if (kind === "velocity") flight.current = flightPath(system, emitter, chance);
    driver.seek(held.time);
    setPlaying(held.playing);
    if (controls !== null && "enabled" in controls) controls.enabled = held.cameraEnabled;
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
  }, [system, emitter.index, kind]);

  useFrame(() => {
    if (drag.current === null) {
      if (controls !== null && "enabled" in controls) {
        cameraEnabled.current = Boolean(controls.enabled);
      }

      const frame = frameOf(driver, emitter);
      spawnFrameInto(emitter, world.basis, frame.orientation, basis);
      placement.current = translationFrame(basis, frame.origin);
      stands.fill(0);
      sampleCurveInto(emitter.emitterPosition, frame.phase, stands, 0);
      base.current = [
        stands[0] + emitter.translationOverride[0],
        stands[1] + emitter.translationOverride[1],
        stands[2] + emitter.translationOverride[2],
      ];

      const at =
        mode === "scale" ? base.current : handlePoint(kind, emitter, base.current, seconds.current);
      object.position.set(...at).applyMatrix4(placement.current);
      if (mode === "scale") {
        const parent = rotationFrame(basis);
        object.quaternion.copy(
          parent === null ? new Quaternion() : viewportRotation(parent, NO_TURN),
        );
        const [x, y, z] = shapeScale(emitter.shape);
        object.scale.set(visible(x), visible(y), visible(z));
      } else {
        object.quaternion.identity();
        object.scale.set(1, 1, 1);
      }
      object.updateMatrixWorld();
    }

    if (kind === "velocity") drawFlight();
  });

  /** The velocity's straight line to the handle, and the flown path with its tenths. */
  function drawFlight() {
    const start = new Vector3(...handlePoint("emit", emitter, base.current, 0)).applyMatrix4(
      placement.current,
    );
    line.set([start.x, start.y, start.z, object.position.x, object.position.y, object.position.z]);
    if (lineAttribute.current !== null) lineAttribute.current.needsUpdate = true;

    const flown = flight.current;
    if (flown === null) return;
    for (let at = 0; at < flown.count; at += 1) {
      for (let axis = 0; axis < 3; axis += 1) {
        path[at * 3 + axis] =
          start.getComponent(axis) + flown.points[at * 3 + axis] * AXIS_SIGN[axis];
      }
    }
    for (let tenth = 0; tenth <= TENTHS; tenth += 1) {
      const at = Math.min(Math.round((tenth / TENTHS) * (flown.count - 1)), flown.count - 1);
      ticks.set(path.subarray(at * 3, at * 3 + 3), tenth * 3);
    }
    flownLine.geometry.setDrawRange(0, flown.count);
    flownLine.geometry.getAttribute("position").needsUpdate = true;
    if (tickAttribute.current !== null) tickAttribute.current.needsUpdate = true;
  }

  function change() {
    const held = drag.current;
    if (held === null) return;

    let value: Point;
    if (mode === "scale") {
      const scale: Point = [
        Math.abs(object.scale.x),
        Math.abs(object.scale.y),
        Math.abs(object.scale.z),
      ];
      value = scaleValue(emitter.shape, scale, held.start);
    } else {
      const local = object.position.clone().applyMatrix4(placement.current.clone().invert());
      value = pointValue(kind, emitter, [local.x, local.y, local.z], held.base, seconds.current);
    }
    if (!value.every(Number.isFinite)) return;

    held.value = value;
    const next = edited(value);
    driver.swap(next);
    if (kind === "velocity") {
      flight.current = flightPath(next, withHandleValue(kind, emitter, value), chance);
    }
    driver.seek(held.time);
  }

  async function finish() {
    const held = drag.current;
    if (held?.saving) return;
    if (held === null || held.value === null || edit.editProperty === undefined) {
      restore();
      return;
    }

    held.saving = true;
    setSaving(true);
    const { field, edits } = handleEdit(kind, emitter, held.value);
    try {
      const saved = await edit.editProperty(holder, field, edits);
      if (drag.current === held) restore(saved ? held.value : undefined);
    } catch {
      if (drag.current === held) restore();
    }
  }

  return (
    <>
      <primitive object={object} />
      {kind === "velocity" && (
        <lineSegments frustumCulled={false}>
          <bufferGeometry ref={lineGeometry}>
            <bufferAttribute ref={lineAttribute} attach="attributes-position" args={[line, 3]} />
          </bufferGeometry>
          <lineBasicMaterial color={colors.gizmo} transparent opacity={STRAIGHT_OPACITY} />
        </lineSegments>
      )}
      {kind === "velocity" && <primitive object={flownLine} material-color={colors.wire} />}
      {kind === "velocity" && (
        <points frustumCulled={false}>
          <bufferGeometry>
            <bufferAttribute ref={tickAttribute} attach="attributes-position" args={[ticks, 3]} />
          </bufferGeometry>
          <pointsMaterial color={colors.wire} size={TICK_SIZE} sizeAttenuation={false} />
        </points>
      )}
      <TransformControls
        key={generation}
        ref={transform}
        enabled={!saving}
        object={object}
        mode={mode}
        space={mode === "scale" ? "local" : "world"}
        showZ={!(mode === "scale" && emitter.shape.kind === "cylinder")}
        onMouseDown={() => {
          onGrab?.();
          drag.current = {
            time: driver.phase,
            playing,
            cameraEnabled: cameraEnabled.current,
            base: base.current,
            start: [object.scale.x, object.scale.y, object.scale.z],
            saving: false,
            value: null,
          };
          setPlaying(false);
        }}
        onObjectChange={change}
        onMouseUp={() => void finish()}
      />
    </>
  );
}

/** A size of zero scales to nothing, so its handle stands at one until it is dragged. */
function visible(size: number): number {
  return Math.abs(size) > 1e-6 ? Math.abs(size) : 1;
}
