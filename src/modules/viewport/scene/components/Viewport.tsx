import { Canvas, type RootState } from "@react-three/fiber";
import {
  type ComponentProps,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { WebGLRenderer, type WebGLRendererParameters } from "three";

import { useContentVisible, useResizeObserver } from "@/hooks";

import { SceneCamera } from "../../camera/components/SceneCamera";
import { CameraPresetContext } from "../../camera/state/presetContext";
import { CAMERA, type CameraPreset } from "../../camera/utils/cameraPresets";
import { AXIS_SIGN } from "../../shared/utils/space";
import { useSceneColors } from "../hooks/sceneColors";
import { type BackdropSource, useMapBackdrop } from "../hooks/useMapBackdrop";
import {
  type AmbientOcclusion,
  drawsAmbientOcclusion,
  NO_AMBIENT_OCCLUSION,
} from "../utils/ambientOcclusion";
import { drawsPostEffects, NO_POST_EFFECTS, type PostEffects } from "../utils/postEffects";
import { DEFAULT_SUN, type SunOverride, withSunOverride } from "../utils/sunLight";
import { OUTPUT_COLOR_SPACE, TONE_MAPPING } from "../utils/world";
import { Backdrop } from "./Backdrop";
import { PostEffectsPass } from "./PostEffectsPass";
import { Sky } from "./Sky";
import { Stage } from "./Stage";
import { Sun } from "./Sun";

export interface ViewportProps {
  /** Whether this surface spends frames, including while its canvas remains mounted. */
  readonly active?: boolean;
  /** A fixed pixel ratio for small preview surfaces. */
  readonly dpr?: number;
  /** The orientation control is drawn over the scene. */
  readonly gizmo?: boolean;
  /** The ground and its grid are drawn. */
  readonly stage: boolean;
  /** The ground wears the midlane's texture rather than the flat token fill. */
  readonly textured: boolean;
  /**
   * The game's own map drawn behind the subject, and null for the flat stage.
   *
   * A backdrop replaces the stage rather than standing on it, so neither the ground plane
   * nor its grid is drawn while one is up.
   */
  readonly backdrop?: BackdropSource | null;
  /** The visibility flags the backdrop draws, as a mask, and the map's own opening ones absent. */
  readonly backdropFlags?: number;
  /** The sky cube map is drawn behind the backdrop, and the flat colour when off. */
  readonly backdropSky?: boolean;
  /** The sun control's fields over the backdrop's own sun, or `DEFAULT_SUN` without one. */
  readonly sun?: SunOverride | null;
  /** The scene's post effects, and the backdrop's own or none when absent. */
  readonly postEffects?: PostEffects | null;
  /** The scene's ambient occlusion, and the backdrop's own or none when absent. */
  readonly ambientOcclusion?: AmbientOcclusion | null;
  /** Which camera the scene draws through, "The viewer" in docs/ux/BIN_EDITOR.md. */
  readonly camera: CameraPreset;
  /** The reader stood the camera on `preset`: Orbit by a drag, an axis view by the gizmo. */
  readonly onCameraStand?: (preset: CameraPreset) => void;
  /**
   * Where a subject stands on the backdrop before anyone moves it, in the scene's space.
   *
   * Reported rather than applied, because the viewport draws the map and the scene owns
   * what stands on it. Null while there is no backdrop.
   */
  readonly onBackdropOrigin?: (origin: readonly [number, number, number] | null) => void;
  /** What the preview draws in the scene, which must include the `Passes` owning the loop. */
  readonly children: ReactNode;
}

/**
 * How the fibre measures the canvas: on every change, and never on a scroll.
 *
 * The default waits 50ms for a resize to settle, which leaves a dragged seam drawing a
 * frame sized for the old box. Pointer events read offsets, so nothing reads where the
 * canvas stands on the page.
 */
const MEASURE: ComponentProps<typeof Canvas>["resize"] = { scroll: false, debounce: 0 };

/** What `opaqueRenderer` reads of the defaults the fibre hands a renderer factory. */
interface CanvasDefaults {
  /** The mounted canvas, which the fibre types against DOM typings of its own. */
  readonly canvas: unknown;
  readonly powerPreference?: WebGLRendererParameters["powerPreference"];
}

/**
 * A renderer on a drawing buffer with no alpha channel.
 *
 * ThreeJS asks the canvas for an alpha channel whatever its own `alpha` says, and a
 * compositor then shows the pane through wherever a blend left the alpha short of one.
 */
function opaqueRenderer({ canvas, powerPreference }: CanvasDefaults): WebGLRenderer {
  const surface = canvas as HTMLCanvasElement;
  const context = surface.getContext("webgl2", {
    alpha: false,
    antialias: true,
    stencil: false,
    powerPreference,
  });
  return new WebGLRenderer({ canvas: surface, context: context ?? undefined });
}

/**
 * A scene in the engine's frame: the camera and its orbit, the colour space and the stage.
 *
 * What a preview draws is its children, so a particle system, a character, or a character
 * wearing its effects stand on the same ground under the same camera (ADR-0035). The
 * gizmo draws as a HUD over the frame, so a child of the canvas has to own the render
 * loop, which `Passes` does.
 */
export function Viewport({
  active = true,
  dpr,
  gizmo = true,
  stage,
  textured,
  backdrop = null,
  backdropFlags,
  backdropSky = true,
  sun = null,
  postEffects = null,
  ambientOcclusion = null,
  camera,
  onCameraStand,
  onBackdropOrigin,
  children,
}: ViewportProps) {
  const colors = useSceneColors();
  const map = useMapBackdrop(backdrop);
  const light = useMemo(() => withSunOverride(map.sun ?? DEFAULT_SUN, sun), [map.sun, sun]);
  const visible = useContentVisible();
  const [sized, setSized] = useState(false);
  const [started, setStarted] = useState(false);
  const measure = useResizeObserver<HTMLDivElement>((element) => {
    setSized(element.clientWidth > 0 && element.clientHeight > 0);
  });
  const running = active && visible && sized;
  const root = useRef<RootState | null>(null);
  const runningNow = useRef(running);
  // Canvas skips configuration at zero size, so hidden panes stop the root directly.
  useLayoutEffect(() => {
    runningNow.current = running;
    if (root.current !== null) setRunning(root.current, running);
  }, [running]);
  useEffect(() => {
    if (running) setStarted(true);
  }, [running]);

  const effects = postEffects ?? map.postEffects ?? NO_POST_EFFECTS;
  const occlusion = ambientOcclusion ?? map.ambientOcclusion ?? NO_AMBIENT_OCCLUSION;

  const origin = map.origin;
  useEffect(() => {
    /* Mirrored the way the backdrop's own group is, so the point lands where the map
       drew it rather than across the scene from it. */
    onBackdropOrigin?.(
      origin === null
        ? null
        : [origin[0] * AXIS_SIGN[0], origin[1] * AXIS_SIGN[1], origin[2] * AXIS_SIGN[2]],
    );
  }, [origin, onBackdropOrigin]);

  return (
    <div
      ref={measure}
      /* ThreeJS pins the canvas at the size last measured, a frame behind the box. */
      className="relative size-full [&_canvas]:size-full!"
    >
      {(started || running) && (
        <Canvas
          dpr={dpr}
          resize={MEASURE}
          frameloop={running ? "always" : "never"}
          camera={{
            position: [...CAMERA.position],
            near: CAMERA.near,
            far: CAMERA.far,
            fov: CAMERA.fov,
          }}
          gl={opaqueRenderer}
          onCreated={(state) => {
            root.current = state;
            setRunning(state, runningNow.current);
            const { gl } = state;
            gl.outputColorSpace = OUTPUT_COLOR_SPACE;
            gl.toneMapping = TONE_MAPPING;
          }}
        >
          <color attach="background" args={[colors.backdrop]} />
          <SceneCamera preset={camera} colors={colors} onStand={onCameraStand} gizmo={gizmo} />
          <Sun light={light} />
          <Stage colors={colors} shown={stage && map.geometry === null} textured={textured} />
          {map.geometry !== null && (
            <>
              {backdropSky && <Sky />}
              <Backdrop
                map={map.geometry}
                materials={map.materials}
                textures={map.textures}
                programs={map.programs}
                programTextures={map.programTextures}
                lightmaps={map.lightmaps}
                light={light}
                flags={backdropFlags ?? map.opening}
              />
            </>
          )}
          <CameraPresetContext value={camera}>{children}</CameraPresetContext>
          {(drawsPostEffects(effects) || drawsAmbientOcclusion(occlusion)) && (
            <PostEffectsPass effects={effects} occlusion={occlusion} />
          )}
        </Canvas>
      )}
    </div>
  );
}

function setRunning(root: RootState, running: boolean): void {
  const state = root.get();
  const mode = running ? "always" : "never";
  if (state.frameloop !== mode) state.setFrameloop(mode);
  // A queued automatic frame in manual mode treats the RAF timestamp as seconds.
  if (!running) state.internal.frames = 0;
}
