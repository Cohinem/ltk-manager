import { CameraControls, type CameraControlsImpl, Grid } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type { Mesh } from "three";

import {
  AXIS_SIGN,
  CHAMPION_HEIGHT,
  GROUND_LEVEL,
  type Look,
  OrientationGizmo,
  type SceneColors,
  UNITS_PER_METRE,
  useSceneColors,
} from "@/modules/viewport";

type Triple = [number, number, number];

/** Where a preview's camera stands, what it looks at, and how far apart the two are. */
export interface Framing {
  readonly position: Triple;
  readonly target: Triple;
  readonly distance: number;
}

/** The mini viewport's gizmo arm length and its place off the corner, in pixels. */
const GIZMO_SIZE = 28;
const GIZMO_MARGIN: [number, number] = [42, 42];

/**
 * The mini viewport's camera controls, gizmo and ground grid, standing at `framing` whenever
 * the emitter changes.
 *
 * A double click on the canvas returns to it. The gizmo draws the bin's axes, mirrored by
 * `AXIS_SIGN`, so each arm points where that channel's field values move a particle and wears
 * the colour of its swatch.
 */
export function PreviewOrbit({ framing }: { framing: Framing }) {
  const controls = useRef<CameraControlsImpl>(null);
  const gl = useThree((state) => state.gl);
  const colors = useSceneColors();

  const onLook = (look: Look) => {
    const current = controls.current;
    if (current === null) return;

    const distance = current.distance;
    const [x, y, z] = framing.target;
    /* Straight down an axis leaves the camera's up undefined, so a view from above leans a hair. */
    const lean = look[1] === 0 ? 0 : 0.001;
    void current.setLookAt(
      x + look[0] * distance,
      y + look[1] * distance,
      z + (look[2] + lean) * distance,
      x,
      y,
      z,
      true,
    );
  };

  useEffect(() => {
    void controls.current?.setLookAt(...framing.position, ...framing.target, false);
  }, [framing]);

  useEffect(() => {
    const element = gl.domElement;
    const reframe = () =>
      void controls.current?.setLookAt(...framing.position, ...framing.target, true);
    element.addEventListener("dblclick", reframe);
    return () => element.removeEventListener("dblclick", reframe);
  }, [gl, framing]);

  return (
    <>
      <CameraControls ref={controls} makeDefault dollyToCursor />
      <PreviewGrid colors={colors} reach={framing.distance} />
      <OrientationGizmo
        colors={colors}
        onLook={onLook}
        sign={AXIS_SIGN}
        size={GIZMO_SIZE}
        margin={GIZMO_MARGIN}
      />
    </>
  );
}

/** How far the grid spreads, which is the stage's ground. */
const GROUND = CHAMPION_HEIGHT * 16;

/** One cell a metre and a heavier line every five, as on the stage's grid. */
const CELL = UNITS_PER_METRE;
const SECTION = CELL * 5;

/**
 * How far the lines read against the backdrop. Stronger than the stage's, which draws over a
 * ground fill where this one draws over nothing.
 */
const GRID_READ = 0.6;

/** The grid fades out over this many framing distances from the target. */
const FADE_REACH = 2;
const GRID_FADE = 1.5;

/** The ground's metre grid, fading with the framing so a small emitter and a large one both read. */
function PreviewGrid({ colors, reach }: { colors: SceneColors; reach: number }) {
  const grid = useRef<Mesh>(null);
  const cell = useMemo(() => colors.backdrop.clone().lerp(colors.grid, GRID_READ), [colors]);
  const section = useMemo(
    () => colors.backdrop.clone().lerp(colors.gridMajor, GRID_READ),
    [colors],
  );

  /* Writing no depth, so a particle on the ground is never cut by a line it stands across. */
  useLayoutEffect(() => {
    const material = grid.current?.material;
    if (material !== undefined && !Array.isArray(material)) material.depthWrite = false;
  });

  return (
    <Grid
      ref={grid}
      position={[0, GROUND_LEVEL, 0]}
      args={[GROUND, GROUND]}
      cellSize={CELL}
      sectionSize={SECTION}
      cellColor={cell}
      sectionColor={section}
      fadeDistance={reach * FADE_REACH}
      fadeStrength={GRID_FADE}
      fadeFrom={0}
    />
  );
}
