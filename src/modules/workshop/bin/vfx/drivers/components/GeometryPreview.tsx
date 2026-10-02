import { OrbitControls } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type Group, Vector3 } from "three";

import { m } from "@/i18n";
import { AXIS_SIGN } from "@/modules/viewport";
import { twMerge } from "@/utils";

import type { EmitterModel, SystemModel } from "../../engine/model/model";
import { useVfxRun, VfxRunContext } from "../../playback/state/run";
import { VfxSystem } from "../../rendering/components/VfxSystem";
import { useVfxMeshes } from "../../rendering/hooks/useVfxMeshes";
import { useVfxTextures } from "../../rendering/hooks/useVfxTextures";
import { drawnFor } from "../../rendering/utils/definitions";
import { definitionBounds } from "../../rendering/utils/systemBounds";
import { useBackdropColor } from "../state/previewBackdrop";
import { NODE_PREVIEW_SIZE, renderPreviewHeight } from "../utils/driverLayout";
import { emitterOf } from "../utils/graphEmitter";
import type { RenderItem } from "../utils/graphItems";
import { FramedCamera, framingOf, PREVIEW_MIP_WIDTH, ViewGuard } from "./EmitterPreview";
import { type Fit, FollowFraming } from "./FollowFraming";
import { NODE_BOX } from "./NodePreviews";
import { PreviewView } from "./PreviewView";
import { drawnOf, SpawnFigure, zeroSized } from "./SpawnPreview";

const BOX_STYLE = { width: NODE_PREVIEW_SIZE, height: NODE_PREVIEW_SIZE } as const;

/** How fast the camera walks round the emitter, in radians a second. */
const TURN = 0.4;

/** A close fit, so a lone mesh or quad fills the box rather than sitting small in it. */
const FIT: Fit = { least: 2, margin: 0.9 };

/**
 * A Geometry node's picture, per "6. Node previews" in docs/ux/VFX_GRAPH.md: the emitter's
 * particles as its primitive draws them, over its spawn shape's faint body, turning.
 *
 * A drag orbits, a right drag pans and the wheel zooms, and the first of them hands the camera
 * to the reader until a double click gives it back. The box is `nodrag` and `nowheel`, so the
 * canvas under it neither moves the node nor zooms, and it keeps its right click from the
 * graph's menu, which a pan starts with.
 */
export function GeometryPreview({ item }: { item: RenderItem }) {
  const system = use(VfxRunContext)?.system ?? null;
  const emitter = useMemo(() => emitterOf(system, item.id), [system, item.id]);
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const [handed, setHanded] = useState(false);

  return (
    <div
      className="flex shrink-0 items-start justify-center px-2"
      style={{ height: renderPreviewHeight(item) }}
    >
      <div
        ref={setBox}
        title={m.workshop_bin_graph_geometry_controls_hint()}
        className={twMerge(NODE_BOX, "nodrag nowheel cursor-grab active:cursor-grabbing")}
        style={BOX_STYLE}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onDoubleClick={() => setHanded(false)}
      >
        <PreviewView className="size-full">
          {emitter !== undefined && system !== null && box !== null && (
            <GeometryScene
              system={system}
              emitter={emitter}
              controls={box}
              handed={handed}
              onHand={() => setHanded(true)}
            />
          )}
        </PreviewView>
      </div>
    </div>
  );
}

interface GeometrySceneProps {
  system: SystemModel;
  emitter: EmitterModel;
  /** The element the orbit, pan and zoom read the pointer and the wheel off. */
  controls: HTMLElement;
  /** The reader holds the camera, so it neither follows the particles nor turns. */
  handed: boolean;
  onHand: () => void;
}

/**
 * The run's own particles of the emitter, at the run's time, so the view plays, pauses and scrubs
 * with the timeline as the other previews do, and draws nothing while none lives. The camera
 * stays on where the particles spawn and walks round it, fitted close to the live particles
 * padded by their size, a mesh's reach included, so scattered births change how far it stands
 * and never where it looks.
 */
function GeometryScene({ system, emitter, controls, handed, onHand }: GeometrySceneProps) {
  const { driver, rig, document } = useVfxRun();
  const backdrop = useBackdropColor();

  const drawn = useMemo(() => drawnFor(system, emitter), [system, emitter]);
  const textures = useVfxTextures(drawn, undefined, PREVIEW_MIP_WIDTH);
  const meshes = useVfxMeshes(drawn);
  const framing = useMemo(
    () => framingOf(definitionBounds(system, drawn, rig.rig)),
    [system, drawn, rig.rig],
  );

  const zero = zeroSized(emitter.shape);
  const figure = useMemo(() => drawnOf(emitter, zero), [emitter, zero]);
  useEffect(
    () => () => {
      figure.body?.faces.dispose();
      figure.body?.edges.dispose();
      figure.body?.turns?.dispose();
    },
    [figure],
  );
  /* Where the particles spawn, at the rig's origin now, which the camera stays on. */
  const spawn = useMemo(() => figure.box.getCenter(new Vector3()), [figure]);
  const anchor = useCallback(
    (out: Vector3) => {
      const [x, y, z] = driver.origin;
      return out.set(
        spawn.x + x * AXIS_SIGN[0],
        spawn.y + y * AXIS_SIGN[1],
        spawn.z + z * AXIS_SIGN[2],
      );
    },
    [spawn, driver],
  );
  /* Where the particles spawn as the view opens, which the orbit turns about. */
  const orbitTarget = useMemo(() => anchor(new Vector3()), [anchor]);
  const placed = useRef<Group>(null);
  useFrame(() => {
    const [x, y, z] = driver.origin;
    placed.current?.position.set(x * AXIS_SIGN[0], y * AXIS_SIGN[1], z * AXIS_SIGN[2]);
  });

  return (
    <>
      <color attach="background" args={[backdrop]} />
      <ViewGuard />
      {framing !== null && <FramedCamera framing={framing} />}
      {framing !== null && !handed && (
        <FollowFraming
          drawn={drawn}
          meshes={meshes}
          framing={framing}
          turn={TURN}
          anchor={anchor}
          fit={FIT}
        />
      )}
      {framing !== null && (
        <OrbitControls
          domElement={controls}
          target={orbitTarget}
          enableDamping={false}
          onStart={onHand}
        />
      )}
      {figure.body !== null && (
        <group ref={placed}>
          <SpawnFigure drawn={figure} zero={zero} marks={false} />
        </group>
      )}
      {drawn.length > 0 && (
        <VfxSystem
          drawn={drawn}
          driver={driver}
          textures={textures}
          meshes={meshes}
          document={document}
          drawOnly
        />
      )}
    </>
  );
}
